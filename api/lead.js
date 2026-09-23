import { kv, LEAD_CHAT, LEAD_THREAD } from './_kv.js';

const SITE = 'https://reklama-diagnostika.vercel.app';
const RATE_LIMIT = 5; // bitta IP uchun soatiga
const clip = (v, n) => String(v).replace(/\s+/g, ' ').trim().slice(0, n);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Faqat o'z saytimizdan: brauzer yuborgan Origin boshqa bo'lsa - rad etamiz.
  const origin = req.headers.origin;
  if (origin && origin !== SITE && !origin.endsWith('.vercel.app')) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const { name, phone, telegram, diag } = req.body || {};
  const digits = String(phone || '').replace(/\D/g, '');

  if (!name || String(name).trim().length < 2 || String(name).length > 200) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }
  if (digits.length < 9 || digits.length > 15) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }

  // Bitta IP soatiga RATE_LIMIT tadan ko'p yubora olmaydi (baza ulanmagan bo'lsa - o'tkazib yuboradi)
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'noip';
  const key = `rl:${ip}`;
  const hits = await kv(['INCR', key]);
  if (hits === 1) await kv(['EXPIRE', key, 3600]);
  if (hits && hits > RATE_LIMIT) {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = LEAD_CHAT();
  const threadId = LEAD_THREAD();

  if (!token || !chatId) {
    res.status(500).json({ error: 'Server not configured' });
    return;
  }

  const d = diag && typeof diag === 'object' ? diag : {};
  const text = [
    'Yangi lid (diagnostika):',
    `Ism: ${clip(name, 100)}`,
    `Telefon: ${clip(phone, 40)}`,
    telegram ? `Telegram: ${clip(telegram, 60)}` : null,
    d.niche ? `Soha: ${clip(d.niche, 100)}` : null,
    '',
    d.budget ? `Byudjet: $${clip(d.budget, 20)}/oy` : null,
    d.leads ? `Lidlar: ${clip(d.leads, 20)} ta/oy` : null,
    d.quality != null ? `Lid sifati: ${clip(d.quality, 10)}%` : null,
    d.conversion != null ? `Sotuv konversiyasi: ${clip(d.conversion, 10)}%` : null,
    d.avgCheck ? `Mahsulot narxi: $${clip(d.avgCheck, 20)}` : null,
    d.cpl != null ? `Lid narxi (CPL): $${clip(d.cpl, 20)}` : null,
    d.cac != null ? `Mijoz narxi (CAC): $${clip(d.cac, 20)}` : null,
    d.revenue != null ? `Oylik daromad: $${clip(d.revenue, 20)}` : null,
    d.profit != null ? `Foyda/zarar: $${clip(d.profit, 20)}` : null,
    d.problem ? `Xulosa: ${clip(d.problem, 150)}` : null,
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
    if (!data.ok) throw new Error('telegram');
    res.status(200).json({ ok: true });
  } catch (err) {
    // Telegram ishlamasa ham lid yo'qolmasin: bazaga saqlab qo'yamiz (/lidlar bilan o'qiladi)
    await kv(['LPUSH', 'leadfail', JSON.stringify({ at: new Date().toISOString(), text })]);
    res.status(200).json({ ok: true, saved: true });
  }
}
