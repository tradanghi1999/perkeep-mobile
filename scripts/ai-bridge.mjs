#!/usr/bin/env bun
/**
 * Bridge AI cho app Perkeep Mobile.
 *
 * Điện thoại -> bridge (HTTP, token) -> OpenCode service (localhost) -> agent "librarian"
 *                                                        -> MCP server "perkeep" -> perkeepd
 *
 * Endpoints (GĐ1):
 *   GET  /ai/health                 -> trạng thái bridge + model/agent
 *   POST /ai/search { text }        -> dịch câu nói thành biểu thức Perkeep + đếm thử
 *   POST /ai/ask    { text }        -> chạy 1 phiên agent (có tool), trả lời + tool đã dùng
 *   POST /ai/tags   { name, mime }  -> gợi ý tag/tên (JSON)
 *
 * Chạy: bun scripts/ai-bridge.mjs   (PORT=4180)
 * Token: env PK_AI_TOKEN hoặc file %LOCALAPPDATA%\pk-ai-token.txt (tự tạo).
 */

import { OpenCode } from '@opencode/client';
import { Service } from '@opencode/client/service';
import { createVideoLink, setTag, findDupes } from './perkeep-lib.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const PORT = Number(process.env.PORT || 4180);
const PROJECT = process.env.PK_PROJECT || 'C:/Users/dfsg/Documents/perkeep-mobile';
const PK = (process.env.PK_BASE || 'http://127.0.0.1:3179').replace(/\/+$/, '');
const PK_USER = process.env.PK_USER || '';
const PK_PASS = process.env.PK_PASS || '';
const AGENT = process.env.PK_AI_AGENT || 'librarian';
const MODEL = {
  providerID: process.env.PK_AI_PROVIDER || 'deepseek',
  id: process.env.PK_AI_MODEL || 'deepseek-flash'
};

// ---------- token ----------
const TOKEN_FILE = join(process.env.LOCALAPPDATA || process.env.HOME || '.', 'pk-ai-token.txt');
let TOKEN = process.env.PK_AI_TOKEN || '';
if (!TOKEN) {
  try {
    if (existsSync(TOKEN_FILE)) TOKEN = readFileSync(TOKEN_FILE, 'utf8').trim();
    if (!TOKEN) {
      TOKEN = randomBytes(18).toString('hex');
      writeFileSync(TOKEN_FILE, TOKEN + '\n', 'utf8');
    }
  } catch (e) {
    console.error('token error:', e.message);
  }
}

// ---------- opencode client ----------
let client = null;
let endpoint = null;
async function oc() {
  if (client) return client;
  endpoint = await Service.ensure();
  client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) });
  return client;
}

// ---------- Perkeep helpers ----------
function pkHeaders(extra = {}) {
  const h = { ...extra };
  if (PK_USER) h.Authorization = 'Basic ' + Buffer.from(`${PK_USER}:${PK_PASS}`).toString('base64');
  return h;
}
async function pkSearch(expression, limit = 5) {
  const res = await fetch(PK + '/my-search/camli/search/query', {
    method: 'POST',
    headers: pkHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expression, limit, sort: '-created' })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
  return (j.blobs || []).length;
}

// ---------- YouTube: kênh + phụ đề ----------
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36' };

const xmlDecode = (s) => String(s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'");

async function resolveChannelId(input) {
  const s = String(input || '').trim();
  const direct = s.match(/(UC[\w-]{20,})/);
  if (direct) return direct[1];
  let url = s;
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://www.youtube.com/' + (s.startsWith('@') ? s : '@' + s);
  }
  const html = await (await fetch(url, { headers: UA })).text();
  const m = html.match(/"channelId":"(UC[\w-]{20,})"/)
    || html.match(/"externalId":"(UC[\w-]{20,})"/)
    || html.match(/"browseId":"(UC[\w-]{20,})"/);
  return m ? m[1] : '';
}

async function channelVideos(input, limit = 5) {
  const id = await resolveChannelId(input);
  if (!id) throw new Error('Không tìm thấy kênh. Dán link kênh (youtube.com/@ten) hoặc channel ID.');
  const xml = await (await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { headers: UA })).text();
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]).slice(0, Math.max(1, Math.min(20, limit)));
  return entries.map((e) => {
    const g = (re) => (e.match(re) || [])[1] || '';
    const vid = g(/<yt:videoId>([^<]+)</);
    return {
      id: vid,
      url: 'https://www.youtube.com/watch?v=' + vid,
      title: xmlDecode(g(/<title>([\s\S]*?)<\/title>/)),
      published: g(/<published>([^<]+)</),
      thumbnail: g(/<media:thumbnail url="([^"]+)"/) || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      author: xmlDecode(g(/<name>([^<]+)</))
    };
  });
}

function ytId(url) {
  try {
    const u = new URL(url);
    if (/youtu\.be$/i.test(u.hostname)) return u.pathname.slice(1).split('/')[0];
    if (u.pathname === '/watch') return u.searchParams.get('v') || '';
    const m = u.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/);
    return m ? m[2] : '';
  } catch { return ''; }
}

async function youtubeTranscript(id) {
  const html = await (await fetch(`https://www.youtube.com/watch?v=${id}`, {
    headers: { ...UA, 'accept-language': 'vi,en' }
  })).text();
  const m = html.match(/"captionTracks":(\[[\s\S]*?\])/);
  if (!m) return { text: '', lang: '' };
  let tracks = [];
  try { tracks = JSON.parse(m[1]); } catch { return { text: '', lang: '' }; }
  const t = tracks.find((x) => /^vi/.test(x.languageCode)) || tracks.find((x) => /^en/.test(x.languageCode)) || tracks[0];
  if (!t?.baseUrl) return { text: '', lang: '' };
  const xml = await (await fetch(t.baseUrl, { headers: UA })).text();
  const text = xmlDecode(xml.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return { text, lang: t.languageCode || '' };
}

// ---------- theo dõi kênh ----------
const WATCH_DIR = join(process.env.LOCALAPPDATA || process.env.HOME || '.', 'pk-watch');
const CH_FILE = join(WATCH_DIR, 'channels.json');
const Q_FILE = join(WATCH_DIR, 'queue.json');
try { mkdirSync(WATCH_DIR, { recursive: true }); } catch {}
const ROOT_DIR = 'C:/Users/dfsg/Documents/perkeep-mobile';
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => writeFileSync(f, JSON.stringify(v, null, 2), 'utf8');
const nowIso = () => new Date().toISOString();

async function schtasks(args) {
  try {
    const p = Bun.spawn(['schtasks', ...args], { stdout: 'ignore', stderr: 'ignore' });
    return await p.exited;
  } catch { return -1; }
}

async function syncTask(ch) {
  const name = 'pk-watch-' + ch.id;
  await schtasks(['/delete', '/tn', name, '/f']);
  if (ch.paused) return;
  const cmd = `"${process.execPath}" run "${ROOT_DIR}/scripts/watch-run.mjs" ${ch.id}`;
  await schtasks(['/create', '/tn', name, '/tr', cmd, '/sc', 'daily', '/st', ch.at || '08:00', '/f']);
}

async function watchRun(id) {
  const chans = readJson(CH_FILE, []);
  const ch = chans.find((c) => c.id === id);
  if (!ch) throw new Error('không thấy kênh');
  const items = await channelVideos(ch.channelId || ch.url, ch.limit || 10);
  const seen = new Set(ch.seen || []);
  const fresh = items.filter((i) => !seen.has(i.id));
  ch.seen = [...seen, ...fresh.map((i) => i.id)].slice(-500);
  ch.lastRun = nowIso();
  ch.lastCount = fresh.length;
  writeJson(CH_FILE, chans);
  if (fresh.length) {
    const q = readJson(Q_FILE, []);
    for (const it of fresh) q.push({ ...it, channel: ch.name, watchId: ch.id, addedAt: nowIso() });
    writeJson(Q_FILE, q.slice(-500));
  }
  return { channel: ch.name, fresh: fresh.length, items: fresh };
}


function stripFence(s) {
  return String(s || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

/** Tách khối <ui>{items}</ui> khỏi câu trả lời để app render file cards. */
/** Chỉ giữ các item thực sự được nhắc trong câu trả lời (tránh 10 card khi trả lời 2). */
function matchItems(text, items) {
  const t = String(text || '').toLowerCase();
  const list = Array.isArray(items) ? items : [];
  if (!t) return list.slice(0, 5);
  const hit = list.filter((i) => {
    const n = String(i.name || '').toLowerCase();
    if (!n) return false;
    if (t.includes(n)) return true;
    const base = n.replace(/\.[^.]+$/, '');
    const key = base.slice(0, Math.min(base.length, 24));
    return key.length >= 6 && t.includes(key);
  });
  return hit.length ? hit : list.slice(0, 5);
}

function extractUi(text) {
  const m = String(text || '').match(/<ui>([\s\S]*?)<\/ui>/i);
  if (!m) return { text: String(text || '').trim(), items: [] };
  let items = [];
  try {
    const j = JSON.parse(m[1]);
    if (Array.isArray(j.items)) {
      items = j.items.slice(0, 10).map((i) => ({
        blobref: String(i.blobref || ''),
        fileRef: String(i.fileRef || ''),
        name: String(i.name || ''),
        mime: String(i.mime || ''),
        size: Number(i.size) || 0,
        date: String(i.date || ''),
        tags: Array.isArray(i.tags) ? i.tags.slice(0, 8).map(String) : []
      })).filter((i) => i.blobref);
    }
  } catch (e) { console.error('ui parse:', e.message); }
  return { text: String(text || '').replace(m[0], '').trim(), items };
}

async function generate(prompt) {
  const c = await oc();
  const r = await c.generate.text({ prompt, model: MODEL });
  return r?.data?.text ?? r?.text ?? '';
}

async function generateJson(prompt) {
  const raw = await generate(prompt);
  const s = stripFence(raw);
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i >= 0 && j > i) {
    try { return JSON.parse(s.slice(i, j + 1)); } catch {}
  }
  throw new Error('model không trả JSON hợp lệ: ' + raw.slice(0, 160));
}

// ---------- agent session ----------
function extractAssistant(messages) {
  const texts = [];
  const tools = [];
  const items = [];
  for (const m of messages || []) {
    if (m.type === 'assistant') {
      if (typeof m.text === 'string' && m.text.trim()) texts.push(m.text.trim());
      const parts = Array.isArray(m.content) ? m.content : [];
      for (const p of parts) {
        if (p?.type === 'text' && p.text) texts.push(p.text);
        if (p?.type === 'tool') {
          if (p.name || p.tool) tools.push(p.name || p.tool);
          // lấy items từ output JSON của perkeep_search (ổn định hơn <ui>)
          const outs = p?.state?.content;
          if (Array.isArray(outs)) {
            for (const c of outs) {
              if (c?.type !== 'text' || !c.text) continue;
              const s = String(c.text).trim();
              if (!s.startsWith('{')) continue;
              try {
                const j = JSON.parse(s);
                if (Array.isArray(j.items)) {
                  for (const it of j.items) {
                    if (it && it.blobref) items.push({
                      blobref: String(it.blobref),
                      fileRef: String(it.fileRef || ''),
                      name: String(it.name || ''),
                      mime: String(it.mime || ''),
                      size: Number(it.size) || 0,
                      date: String(it.date || ''),
                      tags: Array.isArray(it.tags) ? it.tags.slice(0, 8).map(String) : []
                    });
                  }
                }
              } catch {}
            }
          }
        }
      }
      for (const t of m.tools || []) tools.push(t.name || t.tool || String(t));
    }
    if (m.type === 'tool' && (m.name || m.tool)) tools.push(m.name || m.tool);
  }
  const seen = new Set();
  const uniq = items.filter((i) => (seen.has(i.blobref) ? false : (seen.add(i.blobref), true))).slice(0, 10);
  return { text: texts.join('\n').trim(), tools: [...new Set(tools)], items: uniq };
}

async function askAgent(text) {
  const c = await oc();
  const session = await c.session.create({
    title: text.slice(0, 60),
    agent: AGENT,
    model: MODEL,
    location: { directory: PROJECT }
  });
  const sid = session.id || session.sessionID;
  try {
    // Session lưu model riêng; tạo xong phải chọn lại agent+model thì mới đúng.
    await c.session.switchAgent({ sessionID: sid, agent: AGENT });
    await c.session.switchModel({ sessionID: sid, model: MODEL });
    await c.session.prompt({ sessionID: sid, text });
    await c.session.wait({ sessionID: sid });
    const messages = await c.session.context({ sessionID: sid });
    const out = extractAssistant(messages);
    const idle = messages.find((m) => m.type === 'idle');
    if (!out.text && idle?.error) {
      throw new Error(`AI lỗi: ${idle.error.message || idle.error.type || 'unknown'}`);
    }
    return { text: out.text, tools: out.tools, items: out.items, sessionID: sid };
  } finally {
    try { await c.session.remove({ sessionID: sid }); } catch {}
  }
}

// ---------- HTTP ----------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,x-pk-token',
  'Access-Control-Max-Age': '86400'
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

function authorized(req) {
  return !TOKEN || req.headers.get('x-pk-token') === TOKEN;
}

const server = Bun.serve({
  port: PORT,
  hostname: '0.0.0.0',
  idleTimeout: 180,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (!authorized(req)) return json({ error: 'unauthorized' }, 401);

    try {
      if (url.pathname === '/ai/health') {
        await oc();
        return json({ ok: true, service: endpoint?.url, agent: AGENT, model: MODEL, project: PROJECT });
      }

      if (url.pathname === '/ai/search' && req.method === 'POST') {
        const { text } = await req.json();
        if (!text || !String(text).trim()) return json({ error: 'empty' }, 400);
        const today = new Date().toISOString().slice(0, 10);
        const prompt = `Bạn dịch yêu cầu tìm kiếm của người dùng thành MỘT biểu thức tìm kiếm Perkeep.

Quy tắc:
- Chỉ dùng các predicate: filename: tag: title: before: after: is: ref:
- KHÔNG dùng larger:/smaller: (Perkeep không hỗ trợ); muốn lọc dung lượng thì bỏ qua.
- KHÔNG dùng từ khoá trần (Perkeep báo lỗi). Từ khoá phải đi qua filename:/tag:/title:.
- filename: phân biệt hoa/thường; chỉ cho phép '*' ở đầu và/hoặc cuối.
- after:/before: lọc theo NGÀY THÊM vào Perkeep (không phải ngày quay). Nếu người dùng nói một ngày cụ thể mà tên file có thể chứa YYYYMMDD, hãy OR thêm filename:*YYYYMMDD*.
- Nhiều điều kiện nối bằng " or " / " and ", nhóm bằng ngoặc.
- Ngày dạng YYYY-MM-DD. Hôm nay là ${today}.
- Nếu người dùng nói "video" -> filename:*.mp4 or filename:*.mov or filename:*.mkv or filename:*.webm
- Nếu nói "ảnh" -> filename:*.jpg or filename:*.png or filename:*.heic
- Nếu nói "link/youtube" -> tag:video-link

Trả về DUY NHẤT JSON:
{"expression":"...","explain":"giải thích ngắn bằng tiếng Việt"}

Yêu cầu: ${JSON.stringify(text)}`;
        const out = await generateJson(prompt);
        let count = null;
        let error = null;
        try { count = await pkSearch(out.expression, 5); } catch (e) { error = e.message.slice(0, 200); }
        return json({ expression: out.expression || '', explain: out.explain || '', count, error });
      }

      if (url.pathname === '/ai/ask/stream' && req.method === 'POST') {
        const { text } = await req.json();
        if (!text || !String(text).trim()) return json({ error: 'empty' }, 400);

        const c = await oc();
        const session = await c.session.create({
          title: String(text).slice(0, 60),
          agent: AGENT,
          model: MODEL,
          location: { directory: PROJECT }
        });
        const sid = session.id || session.sessionID;
        await c.session.switchAgent({ sessionID: sid, agent: AGENT });
        await c.session.switchModel({ sessionID: sid, model: MODEL });

        const enc = new TextEncoder();
        const ctrl = new AbortController();
        let closed = false;

        const stream = new ReadableStream({
          start(controller) {
            const send = (event, data) => {
              if (closed) return;
              try {
                controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
              } catch {}
            };
            const finish = async (payload) => {
              if (closed) return;
              send('done', payload);
              closed = true;
              try { controller.close(); } catch {}
              try { ctrl.abort(); } catch {}
              try { await c.session.remove({ sessionID: sid }); } catch {}
            };

            const hb = setInterval(() => {
              if (!closed) { try { controller.enqueue(enc.encode(': ping\n\n')); } catch {} }
            }, 10000);

            // lắng nghe event của phiên này
            (async () => {
              const toolNames = new Map();
              try {
                for await (const ev of c.event.subscribe({ signal: ctrl.signal })) {
                  const d = ev?.data || {};
                  if (d.sessionID !== sid) continue;
                  if (ev.type === 'session.text.delta') {
                    if (d.delta) send('delta', { t: d.delta });
                  } else if (ev.type === 'session.tool.input.started') {
                    toolNames.set(d.id, d.name);
                    send('tool', { name: d.name, state: 'start' });
                  } else if (ev.type === 'session.tool.success' || ev.type === 'session.tool.error') {
                    send('tool', { name: toolNames.get(d.id) || '', state: 'done' });
                  } else if (ev.type === 'session.execution.succeeded' || ev.type === 'session.execution.failed') {
                    clearInterval(hb);
                    let final = { text: '', tools: [], items: [] };
                    try {
                      const msgs = await c.session.context({ sessionID: sid });
                      const out = extractAssistant(msgs);
                      const ui = extractUi(out.text);
                      const map = new Map();
                      for (const it of [...(out.items || []), ...(ui.items || [])]) {
                        if (it?.blobref) map.set(it.blobref, { ...map.get(it.blobref), ...it });
                      }
                      final = { text: ui.text, tools: out.tools, items: matchItems(ui.text, [...map.values()]) };
                    } catch {}
                    await finish({ ...final, ok: ev.type.endsWith('succeeded') });
                    return;
                  }
                }
              } catch (e) {
                if (!closed) {
                  clearInterval(hb);
                  await finish({ text: '', tools: [], items: [], error: String(e?.message || e).slice(0, 200) });
                }
              }
            })();

            // ngắt khi client đóng
            req.signal.addEventListener('abort', async () => {
              if (closed) return;
              closed = true;
              try { ctrl.abort(); } catch {}
              try { await c.session.interrupt({ sessionID: sid }); } catch {}
              try { await c.session.remove({ sessionID: sid }); } catch {}
              try { controller.close(); } catch {}
            });

            c.session.prompt({ sessionID: sid, text: String(text) }).catch((e) => {
              finish({ text: '', tools: [], items: [], error: String(e?.message || e).slice(0, 200) });
            });
          },
          cancel() {
            closed = true;
            try { ctrl.abort(); } catch {}
            try { c.session.interrupt({ sessionID: sid }); } catch {}
            try { c.session.remove({ sessionID: sid }); } catch {}
          }
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
            ...CORS
          }
        });
      }

      if (url.pathname === '/ai/ask' && req.method === 'POST') {
        const { text } = await req.json();
        if (!text || !String(text).trim()) return json({ error: 'empty' }, 400);
        const out = await askAgent(String(text));
        const ui = extractUi(out.text);
        const map = new Map();
        for (const it of [...(out.items || []), ...(ui.items || [])]) {
          if (it?.blobref) map.set(it.blobref, { ...map.get(it.blobref), ...it });
        }
        return json({ text: ui.text, items: matchItems(ui.text, [...map.values()]), tools: out.tools });
      }

      if (url.pathname === '/ai/channel' && req.method === 'POST') {
        const { url: ch, limit = 5 } = await req.json();
        if (!ch) return json({ error: 'empty' }, 400);
        const items = await channelVideos(ch, Math.min(20, Math.max(1, Number(limit) || 5)));
        return json({ channel: ch, items });
      }

      if (url.pathname === '/ai/save_links' && req.method === 'POST') {
        const { links = [], tags = [] } = await req.json();
        if (!Array.isArray(links) || !links.length) return json({ error: 'empty' }, 400);
        // chống trùng theo tiêu đề với các video-link đã có
        const existing = new Set();
        try {
          const list = await search('tag:video-link', 200);
          for (const it of list) {
            existing.add(String(it.name || '').toLowerCase().replace(/\s*\[[^\]]+\][^/]*\.json$/i, '').trim());
          }
        } catch {}
        const out = [];
        for (const l of links.slice(0, 20)) {
          const key = String(l.title || '').toLowerCase().trim();
          if (key && existing.has(key)) {
            out.push({ ok: false, skipped: true, url: l.url, title: l.title });
            continue;
          }
          try {
            const r = await createVideoLink({ ...l, tags });
            existing.add(key);
            out.push({ ok: true, url: l.url, title: l.title, ...r });
          } catch (e) {
            out.push({ ok: false, url: l.url, title: l.title, error: String(e?.message || e).slice(0, 200) });
          }
        }
        return json({
          requested: links.length,
          saved: out.filter((x) => x.ok).length,
          skipped: out.filter((x) => x.skipped).length,
          items: out
        });
      }

      if (url.pathname === '/ai/tag' && req.method === 'POST') {
        const { refs = [], tag, add = true } = await req.json();
        if (!tag || !Array.isArray(refs) || !refs.length) return json({ error: 'empty' }, 400);
        const out = [];
        for (const r of refs.slice(0, 100)) {
          try { await setTag(r, tag, add !== false); out.push({ ref: r, ok: true }); }
          catch (e) { out.push({ ref: r, ok: false, error: String(e?.message || e).slice(0, 160) }); }
        }
        return json({ requested: refs.length, ok: out.filter((x) => x.ok).length, items: out });
      }

      if (url.pathname === '/ai/dupes' && req.method === 'POST') {
        const { limit = 200 } = await req.json().catch(() => ({}));
        return json({ groups: await findDupes(limit) });
      }

      if (url.pathname === '/ai/summary' && req.method === 'POST') {
        const { url: videoUrl } = await req.json();
        const id = ytId(videoUrl || '');
        if (!id) return json({ error: 'không phải link YouTube' }, 400);
        const tr = await youtubeTranscript(id);
        if (tr.text) {
          const prompt = `Tóm tắt video sau bằng tiếng Việt, 4-6 gạch đầu dòng, nêu ý chính và số liệu quan trọng. Không bịa.\n\nTranscript:\n${tr.text.slice(0, 14000)}`;
          const text = await generate(prompt);
          return json({ text, source: 'transcript', lang: tr.lang, chars: tr.text.length });
        }
        // YouTube chặn timedtext -> dùng mô tả video (kém hơn, nói rõ cho người dùng)
        const html = await (await fetch(`https://www.youtube.com/watch?v=${id}`, { headers: UA })).text();
        const desc = xmlDecode((html.match(/"shortDescription":"([\s\S]*?)","/) || [])[1] || '').replace(/\\n/g, '\n');
        const title = xmlDecode((html.match(/<meta name="title" content="([^"]+)"/) || [])[1] || '');
        if (!desc) return json({ error: 'video không có phụ đề và cũng không có mô tả' }, 422);
        const prompt = `Dựa vào tiêu đề và mô tả dưới đây, tóm tắt video bằng tiếng Việt 3-4 gạch đầu dòng. Nói rõ đây chỉ là tóm tắt từ mô tả, không phải nội dung đầy đủ. Không bịa.\n\nTiêu đề: ${title}\nMô tả: ${desc.slice(0, 4000)}`;
        const text = await generate(prompt);
        return json({ text, source: 'description', title });
      }

      if (url.pathname === '/ai/watch' && req.method === 'POST') {
        const body = await req.json().catch(() => ({}));
        const action = body.action || 'list';
        const chans = readJson(CH_FILE, []);
        const queue = readJson(Q_FILE, []);

        if (action === 'list') {
          const channels = chans.map(({ seen, ...c }) => ({ ...c, seenCount: (seen || []).length }));
          return json({ channels, queue: queue.length });
        }
        if (action === 'queue') return json({ items: queue });
        if (action === 'dismiss') {
          const ids = new Set(body.ids || []);
          const keep = queue.filter((x) => !ids.has(x.id));
          writeJson(Q_FILE, keep);
          return json({ ok: true, queue: keep.length });
        }
        if (action === 'add' || action === 'update') {
          const chInput = String(body.url || '').trim();
          if (!chInput) return json({ error: 'thiếu link kênh' }, 400);
          const channelId = await resolveChannelId(chInput);
          if (!channelId) return json({ error: 'không tìm thấy kênh' }, 400);
          let name = String(body.name || '').trim();
          if (!name) {
            const one = await channelVideos(channelId, 1);
            name = one[0]?.author || chInput;
          }
          let ch;
          if (action === 'update' && body.id) {
            ch = chans.find((c) => c.id === body.id);
            if (!ch) return json({ error: 'không thấy kênh' }, 404);
          } else {
            ch = { id: randomBytes(5).toString('hex'), seen: [] };
            chans.push(ch);
          }
          Object.assign(ch, {
            name,
            url: chInput,
            channelId,
            limit: Math.min(20, Math.max(1, Number(body.limit) || 10)),
            at: /^\d{2}:\d{2}$/.test(String(body.at || '')) ? body.at : '08:00',
            paused: !!body.paused,
            behavior: body.behavior === 'remind' ? 'remind' : 'queue',
            tags: Array.isArray(body.tags) ? body.tags.slice(0, 6) : ['youtube']
          });
          writeJson(CH_FILE, chans);
          await syncTask(ch);
          return json({ channel: { ...ch, seen: undefined }, channels: chans.length });
        }
        if (action === 'pause' && body.id) {
          const ch = chans.find((c) => c.id === body.id);
          if (!ch) return json({ error: 'không thấy kênh' }, 404);
          ch.paused = !!body.paused;
          writeJson(CH_FILE, chans);
          await syncTask(ch);
          return json({ channel: { ...ch, seen: undefined } });
        }
        if (action === 'remove' && body.id) {
          const ch = chans.find((c) => c.id === body.id);
          if (ch) await schtasks(['/delete', '/tn', 'pk-watch-' + ch.id, '/f']);
          writeJson(CH_FILE, chans.filter((c) => c.id !== body.id));
          return json({ ok: true });
        }
        if (action === 'run') {
          return json(await watchRun(body.id));
        }
        return json({ error: 'action?' }, 400);
      }

      if (url.pathname === '/ai/tags' && req.method === 'POST') {        const { name = '', mime = '', url = '', title = '' } = await req.json();
        const prompt = `Gợi ý tag và tên gọn cho một mục trong thư viện cá nhân.

Thông tin:
- tên: ${JSON.stringify(name)}
- mime: ${JSON.stringify(mime)}
- url: ${JSON.stringify(url)}
- tiêu đề gốc: ${JSON.stringify(title)}

Trả về DUY NHẤT JSON:
{"tags":["tối đa 4 tag, chữ thường, không dấu cách, dùng dấu gạch nối"],"title":"tên gọn nếu cần, hoặc chuỗi rỗng"}`;
        const out = await generateJson(prompt);
        return json({
          tags: Array.isArray(out.tags) ? out.tags.slice(0, 4).map((t) => String(t).toLowerCase().trim()).filter(Boolean) : [],
          title: typeof out.title === 'string' ? out.title : ''
        });
      }

      return json({ error: 'not found' }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: String(e?.message || e).slice(0, 300) }, 500);
    }
  }
});

console.log(`ai-bridge: http://0.0.0.0:${server.port}  (token ${TOKEN.slice(0, 6)}…${TOKEN.slice(-4)})`);
console.log(`  project: ${PROJECT}`);
console.log(`  agent: ${AGENT} · model: ${MODEL.providerID}/${MODEL.id}`);
