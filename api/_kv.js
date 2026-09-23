// Upstash/Vercel KV REST. Env o'zgaruvchilar bo'lmasa - jim o'tkazib yuboradi.
export async function kv(cmd) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    const j = await r.json();
    return j.result;
  } catch (e) {
    return null;
  }
}

// Lidlar tushadigan guruh: bot guruhga qo'shilib /id yozilganda saqlanadi.
export const getLeadChat = async () =>
  (await kv(['GET', 'leadchat'])) || process.env.TELEGRAM_CHAT_ID || null;
