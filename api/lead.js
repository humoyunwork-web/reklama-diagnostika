import { kv, getLeadChat } from './_kv.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { name, phone, diag } = req.body || {};

  if (!name || !phone || String(name).length > 200 || String(phone).length > 50) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = await getLeadChat();
  const threadId = (await kv(['GET', 'leadthread'])) || process.env.TELEGRAM_THREAD_ID;

  if (!token || !chatId) {
    res.status(500).json({ error: 'Server not configured' });
    return;
  }

  const d = diag || {};
  const text = [
    'Yangi lid (diagnostika):',
    `Ism: ${name}`,
    `Telefon: ${phone}`,
    d.niche ? `Soha: ${String(d.niche).slice(0, 200)}` : null,
    '',
    d.budget ? `Byudjet: $${d.budget}/oy` : null,
    d.leads ? `Lidlar: ${d.leads} ta/oy` : null,
    d.quality != null ? `Lid sifati: ${d.quality}%` : null,
    d.conversion != null ? `Sotuv konversiyasi: ${d.conversion}%` : null,
    d.avgCheck ? `Mahsulot narxi: $${d.avgCheck}` : null,
    d.cpl != null ? `Lid narxi (CPL): $${d.cpl}` : null,
    d.cac != null ? `Mijoz narxi (CAC): $${d.cac}` : null,
    d.revenue != null ? `Oylik daromad: $${d.revenue}` : null,
    d.profit != null ? `Foyda/zarar: $${d.profit}` : null,
    d.problem ? `Xulosa: ${d.problem}` : null,
  ].filter((l) => l !== null).join('\n');

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: threadId ? Number(threadId) : undefined,
        text,
      }),
    });
    const data = await tgRes.json();
    if (!data.ok) {
      res.status(502).json({ error: 'Telegram error' });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}
