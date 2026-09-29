-- Estado privado: o navegador nunca recebe o próprio nome nem tokens de terceiros.
create schema if not exists game_private;
revoke all on schema game_private from public, anon, authenticated;
grant usage on schema game_private to service_role;

create table if not exists game_private.rooms (
  code text primary key,
  state jsonb not null,
  touched_at timestamptz not null default now()
);
create table if not exists game_private.requests (
  token_hash text primary key,
  last_read timestamptz,
  last_write timestamptz,
  created_rooms integer not null default 0,
  day date not null default current_date
);
alter table game_private.rooms enable row level security;
alter table game_private.requests enable row level security;
revoke all on all tables in schema game_private from public, anon, authenticated;
grant all on all tables in schema game_private to service_role;
create index if not exists rooms_touched_at on game_private.rooms(touched_at);

create or replace function game_private.visible_state(s jsonb, actor integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare p jsonb; out_players jsonb := '[]'; idx integer := 0; me jsonb;
begin
  me := s->'players'->actor;
  for p in select value from jsonb_array_elements(s->'players') loop
    out_players := out_players || jsonb_build_array(jsonb_build_object(
      'id', p->>'id', 'nick', p->>'nick', 'avatar', coalesce(p->>'avatar',''), 'status', p->>'status',
      'online', (p->>'seen')::timestamptz > now() - interval '25 seconds',
      'ready', coalesce(p->>'identity', '') <> '',
      'identity', case when idx <> actor and s->>'phase' in ('playing','finished') then p->>'identity' else null end
    ));
    idx := idx + 1;
  end loop;
  return jsonb_build_object(
    'code', s->>'code', 'host', s->>'host', 'phase', s->>'phase',
    'round', s->'round', 'version', s->'version', 'turn', s->>'turn', 'finished_at', (s->>'finished_at')::timestamptz,
    'players', out_players, 'me', me->>'id',
    'assignment', case when s->>'phase' = 'choosing' then me->>'target' else null end,
    'submitted', exists(select 1 from jsonb_array_elements(s->'players') x where x->>'id' = me->>'target' and coalesce(x->>'identity','') <> '')
  );
end;
$$;
revoke all on function game_private.visible_state(jsonb, integer) from public, anon, authenticated;
grant execute on function game_private.visible_state(jsonb, integer) to service_role;

create or replace function public.qes_game(action text, token_hash text, room_code text default '', payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  s jsonb; players jsonb; p jsonb; actor integer := -1; target integer := -1;
  n integer; i integer; j integer; candidate text; new_id text; ids text[];
  active_ids text[]; old_turn text; next_turn text; now_text text := now()::text;
  rate game_private.requests%rowtype;
begin
  if token_hash is null or token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Sessão inválida.'; end if;
  if action not in ('create','join','state','list','start','assign','ready','guessed','giveup','kick','leave','profile') or action is null then raise exception 'Ação inválida.'; end if;
  insert into game_private.requests(token_hash) values(qes_game.token_hash) on conflict do nothing;
  select * into rate from game_private.requests r where r.token_hash = qes_game.token_hash for update;
  if action in ('state','list') then
    if rate.last_read > now() - interval '700 milliseconds' then raise exception 'Espere um instante.'; end if;
    update game_private.requests r set last_read = now() where r.token_hash = qes_game.token_hash;
  else
    if rate.last_write > now() - interval '350 milliseconds' then raise exception 'Espere um instante.'; end if;
    update game_private.requests r set last_write = now() where r.token_hash = qes_game.token_hash;
  end if;
  if action = 'list' then
    return jsonb_build_object('rooms', coalesce((
      select jsonb_agg(summary order by touched_at desc) from (
        select r.touched_at, jsonb_build_object(
          'code', r.code,
          'host', coalesce((select x->>'nick' from jsonb_array_elements(r.state->'players') x where x->>'id' = r.state->>'host'), 'Amigos'),
          'players', jsonb_array_length(r.state->'players'),
          'phase', r.state->>'phase'
        ) as summary
        from game_private.rooms r
        where r.touched_at > now() - interval '90 seconds'
          and exists(select 1 from jsonb_array_elements(r.state->'players') x where (x->>'seen')::timestamptz > now() - interval '25 seconds')
          and not (r.state->'banned' ? token_hash)
      ) active
    ), '[]'::jsonb));
  end if;
  if action in ('create','join','profile') and (length(coalesce(payload->>'avatar','')) > 18000 or (coalesce(payload->>'avatar','') <> '' and payload->>'avatar' !~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/=]+$')) then raise exception 'Foto inválida.'; end if;
  if action = 'create' then
    if rate.day = current_date and rate.created_rooms >= 20 then raise exception 'Limite diário de salas atingido.'; end if;
    if length(btrim(payload->>'nick')) not between 2 and 20 or payload->>'nick' is null then raise exception 'Use um nick entre 2 e 20 caracteres.'; end if;
    -- Limpeza limitada a dados temporários antigos deste jogo.
    delete from game_private.rooms where touched_at < now() - interval '24 hours';
    delete from game_private.requests where day < current_date - 2;
    loop
      candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''),1,6));
      new_id := gen_random_uuid()::text;
      p := jsonb_build_object('id', new_id, 'token', token_hash, 'avatar',coalesce(payload->>'avatar',''), 'nick', btrim(payload->>'nick'), 'status','active','identity','','seen',now_text);
      s := jsonb_build_object('code', candidate, 'host', new_id, 'phase','lobby','round',0,'version',0,'turn',null,'banned','[]'::jsonb,'players',jsonb_build_array(p));
      insert into game_private.rooms(code,state) values(candidate,s) on conflict do nothing;
      exit when found;
    end loop;
    update game_private.requests r set created_rooms = case when r.day = current_date then r.created_rooms + 1 else 1 end, day = current_date where r.token_hash = qes_game.token_hash;
    return game_private.visible_state(s,0);
  end if;

  select state into s from game_private.rooms where code = upper(room_code) and touched_at > now() - interval '24 hours' for update;
  if s is null then raise exception 'Sala não encontrada ou encerrada.'; end if;
  players := s->'players';
  n := jsonb_array_length(players);
  for i in 0..n-1 loop
    if players->i->>'token' = token_hash then actor := i; exit; end if;
  end loop;
  if s->'banned' ? token_hash then raise exception 'Você foi expulso desta sala.'; end if;
  if action = 'join' and actor < 0 then
    if s->>'phase' not in ('lobby','finished') then raise exception 'A rodada já começou. Aguarde a próxima.'; end if;
    if n >= 12 then raise exception 'A sala está cheia (12 jogadores).'; end if;
    if length(btrim(payload->>'nick')) not between 2 and 20 or payload->>'nick' is null then raise exception 'Use um nick entre 2 e 20 caracteres.'; end if;
    if exists(select 1 from jsonb_array_elements(players) x where lower(x->>'nick') = lower(btrim(payload->>'nick'))) then raise exception 'Este nick já está na sala.'; end if;
    p := jsonb_build_object('id',gen_random_uuid()::text,'token',token_hash,'avatar',coalesce(payload->>'avatar',''),'nick',btrim(payload->>'nick'),'status','waiting','identity','','seen',now_text);
    players := players || jsonb_build_array(p);
    actor := n;
    n := n+1;
  elsif actor < 0 then
    raise exception 'Você não faz parte desta sala.';
  end if;
  players := jsonb_set(players,array[actor::text,'seen'],to_jsonb(now_text));
  p := players->actor;
  old_turn := s->>'turn';

  if action = 'profile' then
    players := jsonb_set(players,array[actor::text,'avatar'],to_jsonb(coalesce(payload->>'avatar','')));
  end if;
  if action = 'start' then
    if p->>'id' <> s->>'host' and not (s->>'phase' = 'finished' and (s->>'finished_at')::timestamptz <= now() - interval '10 seconds') then raise exception 'Só o anfitrião pode começar.'; end if;
    if s->>'phase' not in ('lobby','finished') then raise exception 'A rodada já está em andamento.'; end if;
    if n < 2 then raise exception 'Aguarde pelo menos 2 jogadores.'; end if;
    if (payload->>'version')::integer is distinct from (s->>'version')::integer then raise exception 'A sala mudou. Tente novamente.'; end if;
    select array_agg(x->>'id' order by random()) into ids from jsonb_array_elements(players) x;
    for i in 0..n-1 loop
      j := array_position(ids,players->i->>'id');
      players := jsonb_set(players,array[i::text,'target'],to_jsonb(ids[(j % n)+1]));
      players := jsonb_set(players,array[i::text,'identity'],'""');
      players := jsonb_set(players,array[i::text,'status'],'"active"');
    end loop;
    s := s || jsonb_build_object('phase','choosing','round',(s->>'round')::integer+1,'turn',null,'finished_at',null);
  elsif action = 'assign' then
    if s->>'phase' <> 'choosing' or (payload->>'round')::integer is distinct from (s->>'round')::integer then raise exception 'Esta escolha já terminou.'; end if;
    if length(btrim(payload->>'identity')) not between 2 and 60 or payload->>'identity' is null then raise exception 'Escolha um nome entre 2 e 60 caracteres.'; end if;
    for i in 0..n-1 loop
      if players->i->>'id' = p->>'target' then target := i; exit; end if;
    end loop;
    if target < 0 then raise exception 'Jogador não encontrado.'; end if;
    if coalesce(players->target->>'identity','') <> '' then raise exception 'Você já enviou o nome.'; end if;
    players := jsonb_set(players,array[target::text,'identity'],to_jsonb(btrim(payload->>'identity')));
    if not exists(select 1 from jsonb_array_elements(players) x where coalesce(x->>'identity','') = '') then
      s := s || jsonb_build_object('phase','playing','turn',players->0->>'id');
    end if;
  elsif action in ('ready','guessed','giveup') then
    if s->>'phase' <> 'playing' then raise exception 'A rodada não está em andamento.'; end if;
    if p->>'status' <> 'active' then raise exception 'Você já terminou esta rodada.'; end if;
    if (payload->>'version')::integer is distinct from (s->>'version')::integer then raise exception 'A vez mudou. Atualize e tente novamente.'; end if;
    if action <> 'giveup' and p->>'id' <> old_turn then raise exception 'Espere a sua vez.'; end if;
    if action in ('guessed','giveup') then
      players := jsonb_set(players,array[actor::text,'status'],to_jsonb(case when action = 'guessed' then 'guessed' else 'gaveup' end));
    end if;
    if action <> 'giveup' or p->>'id' = old_turn then
      for i in 1..n loop
        j := (actor+i) % n;
        if players->j->>'status' = 'active' then next_turn := players->j->>'id'; exit; end if;
      end loop;
      s := jsonb_set(s,'{turn}',coalesce(to_jsonb(next_turn),'null'::jsonb));
    end if;
  elsif action in ('kick','leave') then
    target := actor;
    if action = 'kick' then
      if p->>'id' <> s->>'host' then raise exception 'Só o anfitrião pode expulsar.'; end if;
      if payload->>'target' = p->>'id' then raise exception 'Use Sair para deixar a sala.'; end if;
      target := -1;
      for i in 0..n-1 loop
        if players->i->>'id' = payload->>'target' then target := i; exit; end if;
      end loop;
      if target < 0 then raise exception 'Jogador não encontrado.'; end if;
      s := jsonb_set(s,'{banned}',s->'banned' || jsonb_build_array(players->target->>'token'));
    end if;
    if players->target->>'id' = old_turn then
      for i in 1..n-1 loop
        j := (target+i) % n;
        if players->j->>'status' = 'active' then next_turn := players->j->>'id'; exit; end if;
      end loop;
      s := jsonb_set(s,'{turn}',coalesce(to_jsonb(next_turn),'null'::jsonb));
    end if;
    if players->target->>'id' = s->>'host' and n > 1 then s := jsonb_set(s,'{host}',players->((target+1)%n)->'id'); end if;
    players := players - target;
    if jsonb_array_length(players) = 0 then
      delete from game_private.rooms where code = upper(room_code);
      return jsonb_build_object('left',true);
    end if;
    -- Uma saída durante as escolhas invalida o sorteio e devolve a sala ao lobby.
    if s->>'phase' = 'choosing' then
      s := s || jsonb_build_object('phase','lobby','turn',null);
      for i in 0..jsonb_array_length(players)-1 loop
        players := jsonb_set(players,array[i::text,'identity'],'""');
      end loop;
    end if;
    if target < actor then actor := actor-1; end if;
  end if;

  if s->>'phase' = 'playing' and not exists(select 1 from jsonb_array_elements(players) x where x->>'status' = 'active') then
    s := s || jsonb_build_object('phase','finished','turn',null,'finished_at',now_text);
  end if;
  s := jsonb_set(s,'{players}',players);
  if action <> 'state' then s := jsonb_set(s,'{version}',to_jsonb((s->>'version')::integer+1)); end if;
  update game_private.rooms set state = s, touched_at = now() where code = upper(room_code);
  if action = 'leave' then return jsonb_build_object('left',true); end if;
  return game_private.visible_state(s,actor);
end;
$$;
revoke all on function public.qes_game(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.qes_game(text,text,text,jsonb) to service_role;
