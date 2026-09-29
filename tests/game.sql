-- Execute no SQL Editor do projeto, somente para verificar este jogo.
-- Os dados gerados aqui são temporários e são removidos na própria transação.
begin;
do $$
declare
  tokens text[] := array[md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text)];
  s jsonb; view_b jsonb; test_code text; n integer; i integer; j integer; ids text[]; targets text[];
  my_id text; rejected boolean; cur integer;
begin
  assert not has_function_privilege('anon','public.qes_game(text,text,text,jsonb)','EXECUTE'), 'RPC exposta ao anon';
  assert not has_table_privilege('anon','game_private.rooms','SELECT'), 'Tabela exposta ao anon';
  assert has_function_privilege('service_role','public.qes_game(text,text,text,jsonb)','EXECUTE'), 'Servidor sem acesso';
  for n in 2..3 loop
    update game_private.requests set last_write = null, last_read = null where token_hash = any(tokens);
    s := public.qes_game('create',tokens[1],'',jsonb_build_object('nick','QA 1'));
    test_code := s->>'code';
    for i in 2..n loop
      s := public.qes_game('join',tokens[i],test_code,jsonb_build_object('nick','QA '||i));
    end loop;
    update game_private.requests set last_write = null where token_hash = any(tokens);
    rejected := false;
    begin
      perform public.qes_game('start',tokens[2],test_code,jsonb_build_object('version',s->'version'));
    exception when raise_exception then rejected := true;
    end;
    assert rejected, 'Não anfitrião começou o lobby';
    s := public.qes_game('start',tokens[1],test_code,jsonb_build_object('version',s->'version'));
    ids := '{}'; targets := '{}';
    for i in 1..n loop
      s := public.qes_game('state',tokens[i],test_code);
      assert s->>'assignment' <> s->>'me', 'Sorteou a si mesmo';
      ids := array_append(ids,s->>'me');
      targets := array_append(targets,s->>'assignment');
    end loop;
    assert (select count(distinct x) = n from unnest(targets) x), 'Alvo duplicado';
    for i in 1..n loop
      update game_private.requests set last_write = null where token_hash = tokens[i];
      s := public.qes_game('assign',tokens[i],test_code,jsonb_build_object('round',1,'identity','Identidade '||i));
    end loop;
    assert s->>'phase' = 'playing', 'Não começou após as escolhas';
    update game_private.requests set last_read = null where token_hash = tokens[1];
    s := public.qes_game('state',tokens[1],test_code);
    assert s->'players'->0->>'identity' is null, 'Vazou a própria identidade';
    assert s->'players'->1->>'identity' is not null, 'Escondeu a identidade alheia';
    assert not (s::text like '%"token"%'), 'Vazou tokens';
    rejected := false;
    update game_private.requests set last_write = null where token_hash = tokens[2];
    begin
      perform public.qes_game('ready',tokens[2],test_code,jsonb_build_object('version',s->'version'));
    exception when raise_exception then rejected := true;
    end;
    assert rejected, 'Jogador passou turno alheio';
    update game_private.requests set last_write = null where token_hash = tokens[1];
    s := public.qes_game('ready',tokens[1],test_code,jsonb_build_object('version',s->'version'));
    assert s->>'turn' = ids[2], 'Não passou a vez';
    update game_private.requests set last_write = null where token_hash = tokens[2];
    s := public.qes_game('guessed',tokens[2],test_code,jsonb_build_object('version',s->'version'));
    assert s->'players'->1->>'status' = 'guessed', 'Acerto não registrado';
    assert s->>'turn' <> ids[2], 'Jogador acertou e continuou no turno';
    for i in 1..n loop
      if i = 2 then continue; end if;
      update game_private.requests set last_write = null where token_hash = tokens[i];
      s := public.qes_game('giveup',tokens[i],test_code,jsonb_build_object('version',s->'version'));
    end loop;
    assert s->>'phase' = 'finished', 'Não encerrou a rodada';
    update game_private.rooms set state = jsonb_set(state,'{finished_at}',to_jsonb((now()-interval '11 seconds')::text)) where rooms.code = test_code;
    update game_private.requests set last_write = null where token_hash = tokens[2];
    s := public.qes_game('start',tokens[2],test_code,jsonb_build_object('version',s->'version'));
    assert s->>'phase' = 'choosing' and s->>'round' = '2', 'Nova rodada automática falhou';
    assert not exists(select 1 from jsonb_array_elements(s->'players') x where x->>'ready' = 'true'), 'Nome anterior persistiu';
    update game_private.requests set last_write = null where token_hash = tokens[1];
    s := public.qes_game('kick',tokens[1],test_code,jsonb_build_object('target',ids[2]));
    assert s->>'phase' = 'lobby', 'Sorteio inválido após expulsão';
    rejected := false;
    update game_private.requests set last_write = null where token_hash = tokens[2];
    begin
      perform public.qes_game('join',tokens[2],test_code,jsonb_build_object('nick','QA 2'));
    exception when raise_exception then rejected := true;
    end;
    assert rejected, 'Expulso retornou na mesma sessão';
    if n = 3 then
      update game_private.requests set last_write = null where token_hash = tokens[1];
      perform public.qes_game('leave',tokens[1],test_code);
      update game_private.requests set last_read = null where token_hash = tokens[3];
      s := public.qes_game('state',tokens[3],test_code);
      assert s->>'host' = ids[3], 'Anfitrião não foi transferido';
    end if;
    delete from game_private.rooms r where r.code = test_code;
  end loop;
  delete from game_private.requests where token_hash = any(tokens);
end;
$$;
select 'OK: salas de 2 e 3 jogadores, sorteio, sigilo, turnos, acerto, desistência, nova rodada, expulsão e anfitrião.' as resultado;
commit;
