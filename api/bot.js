import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { waitUntil } from '@vercel/functions';
import { kv, getLeadChat } from './_kv.js';

export const maxDuration = 300;

const VIDEO_URL = 'https://www.youtube.com/watch?v=4rF2qfdhMOg';
const SITE_URL = 'https://reklama-diagnostika.vercel.app';
const FOLLOWUP_MS = 3 * 60 * 1000;

// ponytail: chegara qiymatlari index.html bilan bir xil - birini o'zgartirsangiz, ikkinchisini ham o'zgartiring
function diagnose(budget, leads, quality, conversion, price) {
  const cpl = budget / leads;
  const qualityLeads = leads * quality / 100;
  const sales = qualityLeads * conversion / 100;
  const cac = sales > 0 ? budget / sales : null;
  const revenue = sales * price;
  const profit = revenue - budget;
  const roas = budget > 0 ? revenue / budget : 0;
  const cplRatio = price > 0 ? (cpl / price) * 100 : 0;

  const cplSev = cplRatio > 15 ? 2 : cplRatio > 5 ? 1 : 0;
  const qSev = quality < 35 ? 2 : quality < 60 ? 1 : 0;
  const cSev = conversion < 10 ? 2 : conversion < 25 ? 1 : 0;

  const ranked = [
    { key: 'quality', sev: qSev },
    { key: 'conversion', sev: cSev },
    { key: 'cpl', sev: cplSev },
  ].sort((a, b) => b.sev - a.sev);
  const primary = ranked[0];

  let title, body;
  if (primary.sev === 0) {
    title = 'Voronkangiz nisbatan sog\'lom';
    body = `Barcha bosqichlar (lid narxi, sifat, konversiya) qoniqarli darajada. Oylik sof natijangiz $${Math.round(profit)}. Asosiy vazifa - shu ko'rsatkichlarni saqlab, byudjetni ehtiyotkorlik bilan oshirib borish.`;
  } else if (primary.key === 'quality') {
    title = 'Asosiy muammo: lid sifati';
    body = `Kelayotgan lidlarning atigi ${quality}% i sifatli. Ya'ni har 10 lidning ${Math.round((100 - quality) / 10)}+ tasi shunchaki qiziquvchan yoki noto'g'ri auditoriya - ular hech qachon xarid qilmaydi. Bu ko'pincha noto'g'ri auditoriya tanlash yoki noaniq reklama matnidan kelib chiqadi.`;
  } else if (primary.key === 'conversion') {
    title = 'Asosiy muammo: sotuv jarayoni';
    body = `Lid sifati (${quality}%) yomon emas, lekin sifatli lidlardan atigi ${conversion}% i xaridorga aylanyapti. Demak, muammo reklamada emas - siz yoki jamoangiz lidga qanday javob berayotganida.`;
  } else {
    title = 'Asosiy muammo: lid narxi';
    body = `Bitta lid $${Math.round(cpl)} ga tushyapti - bu mahsulot narxingizning ${Math.round(cplRatio)}% i. Sifat va konversiya normal bo'lsa ham, shu qimmat trafik butun voronkani og'irlashtiradi.`;
  }

  const recos = [];
  if (qSev > 0) recos.push(['Lid sifatini oshirish uchun', [
    'Reklama matnida narx yoki asosiy shartlarni oldindan aniq yozing - noaniqlik qiziqmagan lidlarni ko\'paytiradi.',
    'Auditoriyani torroq qiling: keng auditoriya o\'rniga lookalike yoki aniq qiziqishlar bo\'yicha sozlang.',
    'Forma yoki birinchi xabarga filtrlovchi savol qo\'shing (masalan, byudjet yoki joylashuv).',
  ]]);
  if (cSev > 0) recos.push(['Sotuv konversiyasini oshirish uchun', [
    'Lidga birinchi 5 daqiqa ichida javob bering - javob sekinlashgan sayin xarid ehtimoli keskin tushadi.',
    'Savdo skripti va tez-tez uchraydigan e\'tirozlarga tayyor javoblar yozib chiqing.',
    'Har bir lidni jadval yoki CRM\'da kuzatib boring - follow-up qilmaslik ko\'p sotuvni yo\'qotadi.',
  ]]);
  if (cplSev > 0) recos.push(['Lid narxini pasaytirish uchun', [
    'Yomon ishlayotgan reklama to\'plamlarini o\'chirib, yaxshi natija berayotganlarga byudjetni qayta yo\'naltiring.',
    'Creative (video/rasm) va sarlavhalarni muntazam yangilab, A/B test qiling - eskirgan creative narxni oshiradi.',
    'Pixel/konversiya optimallashtirishni to\'g\'ri sozlang, shunda algoritm arzonroq lidlarni topadi.',
  ]]);
  if (!recos.length) recos.push(['Saqlab qolish uchun', [
    'Hozirgi auditoriya, creative va sotuv jarayonini o\'zgartirmang - ular ishlayapti.',
    'Byudjetni asta-sekin (haftasiga 15-20%) oshirib, natija barqarorligini kuzating.',
  ]]);

  return { cpl, cac, revenue, profit, roas, sales, qualityLeads, title, body, recos };
}

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

async function buildPdf(input, d) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = 595, H = 842, M = 56, maxW = W - M * 2;
  const ink = rgb(0.11, 0.08, 0.25);
  const muted = rgb(0.45, 0.43, 0.55);
  const accent = rgb(0.92, 0.45, 0.28);

  let page = pdf.addPage([W, H]);
  let y = H - M;

  const space = (n) => { y -= n; if (y < M + 40) { page = pdf.addPage([W, H]); y = H - M; } };

  const wrap = (text, f, size) => {
    const words = String(text).split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (f.widthOfTextAtSize(test, size) > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  };

  const write = (text, { size = 11, f = font, color = ink, gap = 5 } = {}) => {
    for (const line of wrap(text, f, size)) {
      space(size + gap);
      page.drawText(line, { x: M, y, size, font: f, color });
    }
  };

  const row = (label, value) => {
    space(18);
    page.drawText(label, { x: M, y, size: 11, font, color: muted });
    page.drawText(value, { x: W - M - bold.widthOfTextAtSize(value, 11), y, size: 11, font: bold, color: ink });
  };

  write('Reklama diagnostikasi', { size: 24, f: bold, gap: 8 });
  write('Voronkangiz bo\'yicha to\'liq xulosa va tavsiyalar', { size: 11, color: muted, gap: 4 });

  space(22);
  write('Sizning raqamlaringiz', { size: 14, f: bold, gap: 6 });
  space(4);
  row('Reklama byudjeti', money(input.budget) + ' / oy');
  row('Kelgan lidlar', input.leads + ' ta / oy');
  row('Lid sifati', input.quality + '%');
  row('Sotuv konversiyasi', input.conversion + '%');
  row('Mahsulot / xizmat narxi', money(input.price));

  space(24);
  write('Hisoblangan ko\'rsatkichlar', { size: 14, f: bold, gap: 6 });
  space(4);
  row('Bitta lid narxi (CPL)', money(d.cpl));
  row('Sifatli lidlar', Math.round(d.qualityLeads) + ' ta');
  row('Sotuvlar', Math.round(d.sales) + ' ta');
  row('Bitta mijoz narxi (CAC)', d.cac ? money(d.cac) : 'hisoblab bo\'lmadi');
  row('Oylik daromad', money(d.revenue));
  row('Sof foyda / zarar', (d.profit >= 0 ? '+' : '-') + money(Math.abs(d.profit)));
  row('ROAS', d.roas.toFixed(1) + 'x');

  space(26);
  write(d.title, { size: 14, f: bold, color: accent, gap: 6 });
  space(2);
  write(d.body, { size: 11, color: ink, gap: 6 });

  space(24);
  write('Nima qilish kerak', { size: 14, f: bold, gap: 6 });
  for (const [title, items] of d.recos) {
    space(10);
    write(title, { size: 11.5, f: bold, color: accent, gap: 4 });
    for (const item of items) write('- ' + item, { size: 11, color: ink, gap: 5 });
  }

  return pdf.save();
}

const tg = (token, method, body) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const saveSubscriber = (chatId, from) =>
  kv(['HSET', 'subs', String(chatId), JSON.stringify({
    name: [from?.first_name, from?.last_name].filter(Boolean).join(' '),
    username: from?.username || '',
    at: new Date().toISOString(),
  })]);

function vslMessage(chatId) {
  return {
    chat_id: chatId,
    text: "Xulosangizni ko'rib chiqdingizmi?\n\nEndi eng muhimi - o'sha kamchiliklarni qanday tuzatish. Men 5 daqiqalik maxsus video tayyorladim: reklama samaradorligini oshirish va voronkadagi teshiklarni yopish bo'yicha aniq qadamlar.\n\nPastdagi tugmani bosing:",
    reply_markup: {
      inline_keyboard: [[{ text: "Videoni ko'rish", url: VIDEO_URL }]],
    },
  };
}

export default async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'Server not configured' });
    return;
  }

  if (req.method === 'GET') {
    // Bir martalik sozlash: /api/bot?setup=1 ni brauzerda oching
    if (req.query.setup) {
      const url = `https://${req.headers.host}/api/bot`;
      const r = await fetch(
        `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(url)}`
      ).then((r) => r.json());
      res.status(200).json({ webhook: url, telegram: r });
      return;
    }
    // Baza tekshiruvi: /api/bot?kv=1
    if (req.query.kv) {
      res.status(200).json({ ping: await kv(['PING']), hasLeadChat: !!(await kv(['GET', 'leadchat'])), subs: (await kv(['HLEN', 'subs'])) });
      return;
    }
    // Tekshiruv: /api/bot?pdf=2000-150-60-25-80 - PDF'ni brauzerda ko'rish
    if (req.query.pdf) {
      const [b, l, q, c, p] = String(req.query.pdf).split('-').map(Number);
      const bytes = await buildPdf(
        { budget: b, leads: l, quality: q, conversion: c, price: p },
        diagnose(b, l, q, c, p)
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.send(Buffer.from(bytes));
      return;
    }
    res.status(200).json({ ok: true, usage: '?setup=1 | ?pdf=byudjet-lidlar-sifat-konversiya-narx' });
    return;
  }

  // kanal postlari boshqa maydonda keladi
  const msg = req.body && (req.body.message || req.body.channel_post);
  const text = msg && msg.text;
  if (!text) {
    res.status(200).json({ ok: true });
    return;
  }
  const chatId = msg.chat.id;
  const admin = process.env.ADMIN_CHAT_ID;

  const isGroup = msg.chat.type !== 'private';

  // Guruhda /id - o'sha guruhni lidlar tushadigan joy qilib belgilaydi
  if (text.trim().split('@')[0] === '/id') {
    let saved = null;
    if (isGroup) {
      saved = await kv(['SET', 'leadchat', String(chatId)]);
      if (msg.message_thread_id) await kv(['SET', 'leadthread', String(msg.message_thread_id)]);
    }
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      message_thread_id: msg.message_thread_id,
      text: isGroup
        ? `${saved ? 'Tayyor. Lidlar shu yerga tushadi.' : 'Saqlab boʻlmadi (baza ulanmagan).'}\nChat ID: ${chatId}`
        : `Sizning chat ID: ${chatId}`,
    });
    res.status(200).json({ ok: true });
    return;
  }

  // Rassilka: admin shaxsiy chatda yoki lidlar guruhida /send Xabar matni
  const canBroadcast =
    (admin && String(chatId) === String(admin)) ||
    (isGroup && String(chatId) === String(await getLeadChat()));
  if (text.startsWith('/send ') && canBroadcast) {
    const body = text.slice(6).trim();
    const ids = (await kv(['HKEYS', 'subs'])) || [];
    waitUntil((async () => {
      let sent = 0;
      for (const id of ids) {
        const r = await tg(token, 'sendMessage', { chat_id: id, text: body }).then((x) => x.json()).catch(() => ({}));
        if (r && r.ok) sent++;
        await new Promise((r2) => setTimeout(r2, 40)); // ponytail: ~25 msg/s, Telegram limiti 30
      }
      await tg(token, 'sendMessage', { chat_id: chatId, text: `Rassilka tugadi: ${sent}/${ids.length} ta yuborildi.` });
    })());
    res.status(200).json({ ok: true });
    return;
  }

  if (isGroup) {
    res.status(200).json({ ok: true });
    return;
  }

  await saveSubscriber(chatId, msg.from);

  const payload = (text.match(/^\/start\s+([\d-]+)$/) || [])[1];
  if (!payload) {
    const extra = admin && String(chatId) === String(admin)
      ? "\n\nAdmin: rassilka uchun /send <matn>"
      : '';
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text: `Salom! Men reklama voronkangiz bo'yicha PDF xulosa tayyorlayman.\n\nBuning uchun avval diagnostikadan o'ting:\n${SITE_URL}\n\nNatija sahifasida "PDF xulosani olish" tugmasini bosing.${extra}`,
    });
    res.status(200).json({ ok: true });
    return;
  }

  const [budget, leads, quality, conversion, price] = payload.split('-').map(Number);
  if (![budget, leads, quality, conversion, price].every((n) => Number.isFinite(n)) || !leads || !budget) {
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text: `Ma'lumotlar to'liq kelmadi. Iltimos, diagnostikani qaytadan to'ldiring: ${SITE_URL}`,
    });
    res.status(200).json({ ok: true });
    return;
  }

  try {
    const d = diagnose(budget, leads, quality, conversion, price);
    const bytes = await buildPdf({ budget, leads, quality, conversion, price }, d);

    const fd = new FormData();
    fd.append('chat_id', String(chatId));
    fd.append('caption', `${d.title}\n\nTo'liq tahlil PDF faylda. Savollaringiz bo'lsa - shu yerga yozing.`);
    fd.append('document', new Blob([bytes], { type: 'application/pdf' }), 'reklama-diagnostikasi.pdf');
    await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: fd });

    // 3 daqiqadan keyin VSL post + tugma (javob Telegram'ga darhol qaytadi)
    waitUntil((async () => {
      await new Promise((r) => setTimeout(r, FOLLOWUP_MS));
      await tg(token, 'sendMessage', vslMessage(chatId));
    })());
  } catch (err) {
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text: "Xulosa tayyorlashda xatolik bo'ldi. Birozdan so'ng qayta urinib ko'ring.",
    });
  }

  res.status(200).json({ ok: true });
}
