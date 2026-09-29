import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/game.js';

function response() {
  return { statusCode:200, headers:{}, body:null,
    setHeader(key,value) { this.headers[key]=value; },
    status(code) { this.statusCode=code; return this; },
    json(body) { this.body=body; return this; },
  };
}

test('API rejeita GET e não faz chamada externa',async () => {
  const res=response(); await handler({method:'GET'},res);
  assert.equal(res.statusCode,405);
  assert.equal(res.headers['Cache-Control'],'no-store');
});

test('API encaminha a sessão ao projeto certo e preserva o retorno',async () => {
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async (url,options) => {
      assert.equal(url,'https://fezriztbwnxcvkwrbybc.supabase.co/functions/v1/quem-eu-sou');
      assert.equal(options.method,'POST');
      assert.equal(JSON.parse(options.body).action,'state');
      assert.equal(JSON.parse(options.body).token,'a'.repeat(64));
      assert.ok(options.headers.apikey.startsWith('sb_publishable_'));
      return Response.json({code:'ABC123',phase:'lobby'});
    };
    const res=response();
    await handler({method:'POST',body:{action:'state',token:'a'.repeat(64),code:'ABC123'}},res);
    assert.deepEqual(res.body,{code:'ABC123',phase:'lobby'});
    assert.equal(res.statusCode,200);
  } finally { globalThis.fetch=original; }
});

test('API comunica erros de jogo e falhas de rede',async () => {
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async () => Response.json({error:'Espere a sua vez.'},{status:409});
    let res=response(); await handler({method:'POST',body:{action:'ready'}},res);
    assert.equal(res.statusCode,409); assert.equal(res.body.error,'Espere a sua vez.');
    globalThis.fetch=async () => { throw Error('Network'); };
    res=response(); await handler({method:'POST',body:{action:'ready'}},res);
    assert.equal(res.statusCode,503); assert.ok(res.body.error);
  } finally { globalThis.fetch=original; }
});
