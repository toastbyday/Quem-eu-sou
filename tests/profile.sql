begin;
do $$
declare t text := md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text); s jsonb; code text; id text;
begin
 s := public.qes_game('create',t,'','{"nick":"QA perfil","avatar":"data:image/jpeg;base64,/9j/AAAA"}');
 code := s->>'code'; id := s->>'me';
 assert s->'players'->0->>'avatar' = 'data:image/jpeg;base64,/9j/AAAA';
 update game_private.requests set last_write=null where token_hash=t;
 s := public.qes_game('profile',t,code,'{"avatar":""}');
 assert jsonb_array_length(s->'players')=1 and s->>'me'=id, 'Perfil removeu associação';
 assert s->'players'->0->>'avatar'='', 'Foto não removida';
 assert s->>'phase'='lobby', 'Perfil alterou partida';
 update game_private.requests set last_write=null where token_hash=t;
 begin
  perform public.qes_game('profile',t,code,'{"avatar":"https://example.com/track"}');
  raise exception 'Foto externa aceita';
 exception when raise_exception then
  if sqlerrm <> 'Foto inválida.' then raise; end if;
 end;
end;
$$;
rollback;
