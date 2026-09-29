const endpoint = 'https://fezriztbwnxcvkwrbybc.supabase.co/functions/v1/quem-eu-sou';
// Esta chave é pública. As credenciais privilegiadas ficam somente no Supabase.
const publicKey = 'sb_publishable_XeCdB3R4CGL8P2Axs2LyVQ_tLPE6QCn';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!payload || JSON.stringify(payload).length > 22000) return res.status(400).json({ error: 'Pedido inválido.' });
    const result = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: publicKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000),
    });
    const data = await result.json();
    return res.status(result.status).json(data);
  } catch {
    return res.status(503).json({ error: 'Não foi possível conectar à sala. Tente novamente.' });
  }
}
