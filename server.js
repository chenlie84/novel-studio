/* 砚台 · 本地服务：静态托管 + LLM 代理
 * 用法：node server.js        默认 http://127.0.0.1:8931
 * Key 来源优先级：运行时配置 > 环境变量
 *   DEEPSEEK_API_KEY=sk-xxx node server.js
 *   OPENROUTER_API_KEY=sk-or-xxx node server.js
 *
 * 安全边界（本服务会持有你的 API Key，所以收得很紧）：
 *   1. 只监听 127.0.0.1
 *   2. 静态文件走白名单，.llm-config.json / server.js 等不会被浏览器读到
 *   3. 校验 Host 与 Origin，防 DNS 重绑定和别的网页跨站调用 /api/*
 *   4. /api/* 的 POST 必须是 application/json（拦掉不触发预检的"简单请求"）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const PORT = Number(process.env.PORT) || 8931;
const HOST = '127.0.0.1';
const ROOT = __dirname;
const CONFIG_FILE = path.join(ROOT, '.llm-config.json');
const UPSTREAM_CONNECT_TIMEOUT = 60 * 1000;   // 等上游响应头的最长时间

const PROVIDERS = {
  deepseek: {
    url: 'https://api.deepseek.com/chat/completions',
    env: 'DEEPSEEK_API_KEY',
    headers: (key) => ({ Authorization: 'Bearer ' + key })
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    env: 'OPENROUTER_API_KEY',
    headers: (key) => ({
      Authorization: 'Bearer ' + key,
      'HTTP-Referer': 'http://localhost:' + PORT,
      'X-Title': 'Yantai Novel Studio'
    })
  }
};

let keys = {};
try {
  keys = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) || {};
} catch (e) { keys = {}; }

function keyOf(provider) {
  const p = PROVIDERS[provider];
  if (!p) return '';
  return keys[provider] || process.env[p.env] || '';
}

function providerStatus() {
  const out = {};
  Object.keys(PROVIDERS).forEach((k) => { out[k] = !!keyOf(k); });
  return out;
}

/* 先写临时文件再改名，进程中途被杀也不会留下半截 JSON */
function persist() {
  const tmp = CONFIG_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(keys, null, 2), { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);          // 文件已存在时 mode 参数不生效，这里补一次
    fs.renameSync(tmp, CONFIG_FILE);
  } catch (e) {
    console.warn('配置写入失败:', e.message);
    try { fs.unlinkSync(tmp); } catch (e2) {}
  }
}

/* ---------- 静态文件白名单 ---------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

/* 页面真正用到的根目录文件。新增前端文件时记得加到这里 */
const PUBLIC_ROOT_FILES = new Set([
  'index.html', 'app.css', 'app.js', 'ai.js', 'analyze.js', 'data.js', 'rank.js'
]);
const PUBLIC_DIRS = new Set(['screenshots']);

function resolveStatic(urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch (e) { return null; }
  if (rel.indexOf('\0') >= 0) return null;
  if (rel === '/') rel = '/index.html';

  const parts = rel.split('/').filter(Boolean);
  if (!parts.length || parts.some((s) => s === '..' || s.startsWith('.'))) return null;

  const ok = parts.length === 1
    ? PUBLIC_ROOT_FILES.has(parts[0])
    : PUBLIC_DIRS.has(parts[0]);
  if (!ok) return null;

  const file = path.join(ROOT, ...parts);
  /* 必须带分隔符比较，否则 /home/x/novel-studio-evil 也会通过 startsWith */
  if (!file.startsWith(ROOT + path.sep)) return null;
  if (!MIME[path.extname(file).toLowerCase()]) return null;
  return file;
}

function serveStatic(req, res, urlPath) {
  const file = resolveStatic(urlPath);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()],
      'Content-Length': st.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    const rs = fs.createReadStream(file);
    rs.on('error', () => res.destroy());
    rs.pipe(res);
  });
}

/* ---------- 工具 ---------- */

function sendJson(res, code, obj) {
  if (res.headersSent) { res.end(); return; }
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const max = limit || 2 * 1024 * 1024;
    let size = 0;
    let dead = false;
    const chunks = [];
    req.on('data', (c) => {
      if (dead) return;
      size += c.length;
      if (size > max) {
        dead = true;
        reject(new Error('请求体过大'));
        return;                         // 不 destroy：让 400 能正常回给浏览器
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (dead) return;
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new Error('JSON 解析失败')); }
    });
    req.on('error', (e) => { if (!dead) reject(e); });
  });
}

/* Host / Origin 校验：只认本机访问自己 */
function allowedHosts() {
  return new Set(['127.0.0.1:' + PORT, 'localhost:' + PORT, '[::1]:' + PORT]);
}

function hostOk(req) {
  return allowedHosts().has(String(req.headers.host || '').toLowerCase());
}

function originOk(req) {
  const origin = req.headers.origin;
  if (!origin) return true;             // 同源的 GET / curl 不带 Origin
  try {
    const u = new URL(origin);
    return allowedHosts().has(u.host.toLowerCase());
  } catch (e) { return false; }
}

function isJsonRequest(req) {
  return /^application\/json\b/i.test(req.headers['content-type'] || '');
}

/* ---------- LLM 代理 ---------- */

function validMessages(m) {
  return Array.isArray(m) && m.length > 0 && m.every((x) =>
    x && typeof x.role === 'string' && typeof x.content === 'string');
}

async function handleLLM(req, res) {
  let payload;
  try { payload = await readBody(req, 8 * 1024 * 1024); }
  catch (e) { return sendJson(res, 400, { error: e.message }); }

  const provider = payload.provider || 'deepseek';
  const p = Object.prototype.hasOwnProperty.call(PROVIDERS, provider) ? PROVIDERS[provider] : null;
  if (!p) return sendJson(res, 400, { error: '未知的 provider: ' + provider });
  if (typeof payload.model !== 'string' || !payload.model.trim()) {
    return sendJson(res, 400, { error: '缺少模型名' });
  }
  if (!validMessages(payload.messages)) {
    return sendJson(res, 400, { error: 'messages 格式不对' });
  }

  const key = keyOf(provider);
  if (!key) {
    return sendJson(res, 401, {
      error: `没有配置 ${provider} 的 API Key`,
      hint: '在页面右上角「AI 设置」里填写，或用环境变量 ' + p.env + ' 启动服务'
    });
  }

  const body = {
    model: payload.model.trim(),
    messages: payload.messages,
    temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.8,
    stream: !!payload.stream
  };
  if (payload.max_tokens) body.max_tokens = payload.max_tokens;
  if (payload.json) body.response_format = { type: 'json_object' };
  /* 流式时让上游把 usage 一起发回来，前端才能显示 token 数与耗时 */
  if (body.stream && payload.usage !== false) body.stream_options = { include_usage: true };

  /* 浏览器点"中断"/关页面 → 连接断开 → 同时掐掉上游请求，别替用户白烧 token */
  const ctrl = new AbortController();
  const onClose = () => { if (!res.writableEnded) ctrl.abort(); };
  res.on('close', onClose);

  /* 只限制"等响应头"的时间；流式正文可以慢慢来 */
  let connectTimer = setTimeout(() => ctrl.abort(), UPSTREAM_CONNECT_TIMEOUT);

  let upstream;
  const t0 = Date.now();
  try {
    upstream = await fetch(p.url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, p.headers(key)),
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
  } catch (e) {
    clearTimeout(connectTimer);
    if (res.destroyed) return;
    const timedOut = e && e.name === 'AbortError';
    return sendJson(res, 502, {
      error: timedOut ? '等待上游响应超时（60 秒没有返回）' : '连接上游失败：' + e.message,
      diag: { kind: 'network', provider, url: p.url, ms: Date.now() - t0, message: timedOut ? 'timeout' : e.message }
    });
  }
  clearTimeout(connectTimer);

  const rid = upstream.headers.get('x-request-id') || upstream.headers.get('x-openrouter-id') || '';

  if (!upstream.ok) {
    let text = '';
    try { text = await upstream.text(); } catch (e) {}
    let msg = text.slice(0, 800);
    try {
      const j = JSON.parse(text);
      const m = j.error && (j.error.message || j.error);
      if (m) msg = typeof m === 'string' ? m : JSON.stringify(m);
    } catch (e) {}
    return sendJson(res, upstream.status, {
      error: '上游返回 ' + upstream.status + '：' + msg,
      diag: {
        kind: 'upstream', status: upstream.status, provider, model: body.model,
        requestId: rid, ms: Date.now() - t0, body: text.slice(0, 1200)
      }
    });
  }

  if (body.stream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Upstream-Model': body.model,
      'X-Upstream-Request-Id': rid
    });
    /* 必须挂 error 处理：上游中途断流时，没有监听器的 'error' 会让整个进程退出 */
    const src = Readable.fromWeb(upstream.body);
    src.on('error', () => { if (!res.writableEnded) res.end(); });
    res.on('error', () => src.destroy());
    src.pipe(res);
    return;
  }

  let data;
  try { data = await upstream.json(); }
  catch (e) {
    return sendJson(res, 502, {
      error: '上游返回的不是合法 JSON',
      diag: { kind: 'upstream', status: 502, provider, model: body.model, requestId: rid, ms: Date.now() - t0 }
    });
  }
  const choice = (data.choices && data.choices[0]) || {};
  sendJson(res, 200, {
    content: (choice.message && choice.message.content) || '',
    usage: data.usage || null,
    model: data.model || body.model,
    finish: choice.finish_reason || '',
    requestId: rid,
    ms: Date.now() - t0
  });
}

/* ---------- 路由 ---------- */

async function route(req, res) {
  const url = req.url.split('?')[0];

  if (!hostOk(req)) { res.writeHead(403); res.end('Forbidden host'); return; }

  if (url.startsWith('/api/')) {
    if (!originOk(req)) return sendJson(res, 403, { error: '跨站请求被拒绝' });

    if (url === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, providers: providerStatus() });
    }

    if (url === '/api/config') {
      if (req.method === 'GET') return sendJson(res, 200, { providers: providerStatus() });
      if (req.method === 'POST') {
        if (!isJsonRequest(req)) return sendJson(res, 415, { error: '需要 Content-Type: application/json' });
        let b;
        try { b = await readBody(req); } catch (e) { return sendJson(res, 400, { error: e.message }); }
        const provider = b.provider;
        if (!Object.prototype.hasOwnProperty.call(PROVIDERS, provider)) {
          return sendJson(res, 400, { error: '未知的 provider' });
        }
        const key = String(b.key || '').trim();
        if (!key) { delete keys[provider]; persist(); return sendJson(res, 200, { ok: true, cleared: true, providers: providerStatus() }); }
        if (/[\s\r\n]/.test(key) || key.length > 300) return sendJson(res, 400, { error: 'Key 格式不对' });
        keys[provider] = key;
        persist();
        return sendJson(res, 200, { ok: true, providers: providerStatus() });
      }
    }

    if (url === '/api/llm' && req.method === 'POST') {
      if (!isJsonRequest(req)) return sendJson(res, 415, { error: '需要 Content-Type: application/json' });
      return handleLLM(req, res);
    }

    return sendJson(res, 404, { error: '没有这个接口' });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end('Method not allowed'); return; }
  serveStatic(req, res, url);
}

const server = http.createServer((req, res) => {
  /* 任何一个请求出错都不能拖垮整个进程 */
  Promise.resolve(route(req, res)).catch((e) => {
    console.warn('请求处理失败:', req.method, req.url, e && e.message);
    try { sendJson(res, 500, { error: '服务内部错误' }); } catch (e2) { try { res.destroy(); } catch (e3) {} }
  });
});

server.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

process.on('unhandledRejection', (e) => console.warn('unhandledRejection:', e && e.message));

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log('');
    console.log('  砚台 · 小说创作工作台');
    console.log('  http://' + HOST + ':' + PORT);
    console.log('');
    console.log('  DeepSeek Key   : ' + (keyOf('deepseek') ? '已配置' : '未配置（页面右上角「AI 设置」可填）'));
    console.log('  OpenRouter Key : ' + (keyOf('openrouter') ? '已配置' : '未配置'));
    console.log('');
  });
}

module.exports = { server, resolveStatic };
