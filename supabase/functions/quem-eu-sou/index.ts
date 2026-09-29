// Sessões convidadas: token aleatório de 256 bits; somente seu hash chega ao banco.
// Operações da sala autenticam a associação e as permissões no banco, sob lock.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: cors });

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
  try {
    const raw = await request.text();
    if (raw.length > 4096) return reply({ error: 'Pedido muito grande.' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return reply({ error: 'Pedido inválido.' }, 400); }
    if (!body || typeof body !== 'object' || !/^[0-9a-f]{64}$/.test(body.token || '')) return reply({ error: 'Sessão inválida.' }, 401);
    if (!['create','join','state','start','assign','ready','guessed','giveup','kick','leave'].includes(body.action)) return reply({ error: 'Ação inválida.' }, 400);
    if (body.action !== 'create' && !/^[0-9A-F]{6}$/.test(body.code || '')) return reply({ error: 'O código precisa ter 6 caracteres.' }, 400);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.token));
    const hash = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2,'0')).join('');
    const payload: Record<string, unknown> = {};
    if (['create','join'].includes(body.action)) {
      if (typeof body.nick !== 'string') return reply({ error: 'Informe seu nick.' },400);
      payload.nick = body.nick.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,20);
    }
    if (body.action === 'assign') {
      if (typeof body.identity !== 'string') return reply({ error: 'Informe o nome secreto.' },400);
      payload.identity = body.identity.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,60);
    }
    if (body.target !== undefined) {
      if (typeof body.target !== 'string' || body.target.length > 40) return reply({ error: 'Jogador inválido.' },400);
      payload.target = body.target;
    }
    for (const key of ['version','round']) {
      if (body[key] !== undefined) {
        if (!Number.isSafeInteger(body[key]) || body[key] < 0) return reply({ error: 'Rodada inválida.' },400);
        payload[key] = body[key];
      }
    }
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const url = Deno.env.get('SUPABASE_URL');
    if (!serviceKey || !url) return reply({ error: 'Servidor indisponível.' },503);
    const result = await fetch(`${url}/rest/v1/rpc/qes_game`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ action: body.action, token_hash: hash, room_code: body.code || '', payload }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await result.json();
    if (!result.ok) {
      if (data.code === 'P0001') return reply({ error: data.message }, data.message.includes('instante') ? 429 : 409);
      console.error('Game RPC failure', data.code);
      return reply({ error: 'Não foi possível atualizar a sala.' },500);
    }
    return reply(data);
  } catch {
    return reply({ error: 'Conexão interrompida. Tente novamente.' },503);
  }
});
