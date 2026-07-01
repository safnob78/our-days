#!/usr/bin/env node
// Our Days — sync server (Node standard library only, zero npm dependencies).
//
// Holds the family journal so both phones can read/write it and see each
// other's entries live. Text lives in records.json; photos/videos/voice audio
// live as files under media/. Live updates are pushed with Server-Sent Events.
//
// Run:  node server.js        (PORT=8787 DATA_DIR=./server-data by default)
// The app itself is served from this same origin, so the phones load
// everything from one HTTPS address (via Tailscale) — no mixed-content issues.

'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT     = parseInt(process.env.PORT || '8787', 10);
const APP_DIR  = __dirname;                                   // where index.html lives
const DATA_DIR = process.env.DATA_DIR || path.join(APP_DIR, 'server-data');
const MEDIA_DIR= path.join(DATA_DIR, 'media');
const REC_FILE = path.join(DATA_DIR, 'records.json');
const TOKEN    = process.env.OURDAYS_TOKEN || '';            // optional shared secret

fs.mkdirSync(MEDIA_DIR, { recursive: true });

// ── In-memory state ───────────────────────────────────────────────────────────
let records = new Map();   // id -> record {id,kind,person,date,ts,updatedAt,deleted,seq,...}
let seq = 0;
try {
  const raw = JSON.parse(fs.readFileSync(REC_FILE, 'utf8'));
  (raw.records || []).forEach(r => { records.set(r.id, r); if (r.seq > seq) seq = r.seq; });
  console.log(`[ourdays] loaded ${records.size} record(s), seq=${seq}`);
} catch (_) { console.log('[ourdays] starting with an empty journal'); }

let persistTimer = null;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const tmp = REC_FILE + '.tmp';
    const data = JSON.stringify({ records: [...records.values()] });
    fs.writeFile(tmp, data, err => {
      if (err) return console.error('[ourdays] persist failed', err);
      fs.rename(tmp, REC_FILE, e => { if (e) console.error('[ourdays] rename failed', e); });
    });
  }, 250);
}

// ── SSE clients ────────────────────────────────────────────────────────────────
const clients = new Set();
function sseRecord(rec) { return `event: record\nid: ${rec.seq}\ndata: ${JSON.stringify(rec)}\n\n`; }
function broadcast(rec) {
  const line = sseRecord(rec);
  for (const res of clients) { try { res.write(line); } catch (_) {} }
}

// Assign a new seq, stamp, store, persist, and push to everyone.
function upsert(rec) {
  seq += 1;
  rec.seq = seq;
  if (!rec.updatedAt) rec.updatedAt = Date.now();
  records.set(rec.id, rec);
  persist();
  broadcast(rec);
  return rec;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────
function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Meta, X-Token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  });
  res.end(body);
}
function readBody(req, limit, cb) {          // limit in bytes
  const chunks = []; let size = 0, aborted = false;
  req.on('data', c => {
    if (aborted) return;
    size += c.length;
    if (size > limit) { aborted = true; cb(new Error('too large')); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => { if (!aborted) cb(null, Buffer.concat(chunks)); });
  req.on('error', e => { if (!aborted) cb(e); });
}
function authed(req, url) {
  if (!TOKEN) return true;
  return (req.headers['x-token'] === TOKEN) || (url.searchParams.get('token') === TOKEN);
}
const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
  '.webmanifest':'application/manifest+json', '.ico':'image/x-icon',
};
function safeMediaPath(id) {                 // never let an id escape MEDIA_DIR
  const clean = String(id).replace(/[^A-Za-z0-9._-]/g, '_');
  return path.join(MEDIA_DIR, clean);
}

// ── Request router ────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (req.method === 'OPTIONS') return send(res, 204, '');

  // ---- API ----
  if (p.startsWith('/api/')) {
    if (!authed(req, url)) return send(res, 401, JSON.stringify({ error: 'unauthorized' }));

    if (p === '/api/health')
      return send(res, 200, JSON.stringify({ ok: true, count: records.size, seq }));

    if (p === '/api/changes' && req.method === 'GET') {
      const since = parseInt(url.searchParams.get('since') || '0', 10);
      const out = [...records.values()].filter(r => r.seq > since).sort((a, b) => a.seq - b.seq);
      return send(res, 200, JSON.stringify({ seq, records: out }));
    }

    if (p === '/api/events' && req.method === 'GET') {
      // resume from Last-Event-ID on reconnect, else the ?since= the client asked for
      const since = parseInt(req.headers['last-event-id'] || url.searchParams.get('since') || '0', 10);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write('retry: 3000\n\n');
      // replay everything the client missed, in order
      [...records.values()].filter(r => r.seq > since).sort((a, b) => a.seq - b.seq)
        .forEach(r => res.write(sseRecord(r)));
      res.write(`event: synced\ndata: ${seq}\n\n`);
      clients.add(res);
      const ka = setInterval(() => { try { res.write(': keep-alive\n\n'); } catch (_) {} }, 25000);
      req.on('close', () => { clients.delete(res); clearInterval(ka); });
      return;
    }

    if (p === '/api/record' && req.method === 'POST') {
      return readBody(req, 2 * 1024 * 1024, (err, buf) => {
        if (err) return send(res, 413, JSON.stringify({ error: 'too large' }));
        let rec; try { rec = JSON.parse(buf.toString('utf8')); } catch (_) { return send(res, 400, '{"error":"bad json"}'); }
        if (!rec || !rec.id || !rec.kind) return send(res, 400, '{"error":"missing id/kind"}');
        // last-writer-wins: ignore stale edits
        const cur = records.get(rec.id);
        if (cur && (rec.updatedAt || 0) < (cur.updatedAt || 0)) return send(res, 200, JSON.stringify({ seq: cur.seq, stale: true }));
        if (cur && cur.hasBlob && rec.hasBlob === undefined) rec.hasBlob = cur.hasBlob;
        const saved = upsert(rec);
        return send(res, 200, JSON.stringify({ seq: saved.seq }));
      });
    }

    const mediaPut = p.match(/^\/api\/media\/(.+)$/);
    if (mediaPut && req.method === 'PUT') {
      const id = decodeURIComponent(mediaPut[1]);
      let meta = {}; try { meta = JSON.parse(req.headers['x-meta'] || '{}'); } catch (_) {}
      return readBody(req, 512 * 1024 * 1024, (err, buf) => {          // up to 512 MB per file
        if (err) return send(res, 413, JSON.stringify({ error: 'too large' }));
        fs.writeFile(safeMediaPath(id), buf, e => {
          if (e) return send(res, 500, JSON.stringify({ error: 'write failed' }));
          const rec = Object.assign({}, meta, { id, hasBlob: true, deleted: false });
          if (!rec.kind) rec.kind = 'photo';
          rec.updatedAt = Date.now();
          const saved = upsert(rec);
          return send(res, 200, JSON.stringify({ seq: saved.seq }));
        });
      });
    }

    const mediaGet = p.match(/^\/api\/media\/(.+)$/);
    if (mediaGet && req.method === 'GET') {
      const id = decodeURIComponent(mediaGet[1]);
      const rec = records.get(id);
      const file = safeMediaPath(id);
      fs.stat(file, (e, st) => {
        if (e || !st.isFile()) return send(res, 404, JSON.stringify({ error: 'not found' }));
        res.writeHead(200, {
          'Content-Type': (rec && rec.mime) || 'application/octet-stream',
          'Content-Length': st.size,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*',
        });
        fs.createReadStream(file).pipe(res);
      });
      return;
    }

    return send(res, 404, JSON.stringify({ error: 'unknown endpoint' }));
  }

  // ---- Static app files ----
  if (req.method !== 'GET') return send(res, 405, 'Method Not Allowed', 'text/plain');
  let rel = decodeURIComponent(p);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(APP_DIR, rel));
  if (!file.startsWith(APP_DIR)) return send(res, 403, 'Forbidden', 'text/plain');
  // never serve the journal data or server internals as static files —
  // journal media only ever goes through the token-gated /api/media route
  if (file.startsWith(DATA_DIR) || /(^|\/)(server\.js|server-data|start-server\.sh)($|\/)/.test(file.slice(APP_DIR.length)))
    return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (e, buf) => {
    if (e) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Service-Worker-Allowed': '/',
    });
    res.end(buf);
  });
});

function flushSync() {
  try {
    clearTimeout(persistTimer);
    fs.writeFileSync(REC_FILE, JSON.stringify({ records: [...records.values()] }));
  } catch (e) { console.error('[ourdays] final flush failed', e); }
}
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => { flushSync(); process.exit(0); }));

server.listen(PORT, () => {
  console.log(`[ourdays] serving app + sync on http://0.0.0.0:${PORT}`);
  if (TOKEN) console.log('[ourdays] API requires the shared token (OURDAYS_TOKEN).');
  console.log('[ourdays] expose it over your tailnet with:  tailscale serve --bg ' + PORT);
});
