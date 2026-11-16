/* 砚台 · 本地服务：静态托管 + LLM 代理
 * 用法：node server.js        默认 http://127.0.0.1:8931
 * Key 来源优先级：运行时配置 > 环境变量
 *   DEEPSEEK_API_KEY=sk-xxx node server.js
 *   OPENROUTER_API_KEY=sk-or-xxx node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const PORT = process.env.PORT || 8931;
const HOST = '127.0.0.1';
const ROOT = __dirname;
const CONFIG_FILE = path.join(ROOT, '.llm-config.json');

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
  keys = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
} catch (e) { keys = {}; }

function keyOf(provider) {
  const p = PROVIDERS[provider];
  if (!p) return '';
  return keys[provider] || process.env[p.env] || '';
}

function persist() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 });
  } catch (e) { console.warn('配置写入失败:', e.message); }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8'
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > (limit || 2 * 1024 * 1024)) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new Error('JSON 解析失败')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(file).pipe(res);
  });
}

async function handleLLM(req, res) {
  let payload;
  try { payload = await readBody(req, 8 * 1024 * 1024); }
  catch (e) { return sendJson(res, 400, { error: e.message }); }

  const provider = payload.provider || 'deepseek';
  const p = PROVIDERS[provider];
  if (!p) return sendJson(res, 400, { error: '未知的 provider: ' + provider });

  const key = keyOf(provider);
  if (!key) {
    return sendJson(res, 401, {
      error: `没有配置 ${provider} 的 API Key`,
      hint: '在页面右上角「AI 设置」里填写，或用环境变量 ' + p.env + ' 启动服务'
    });
  }

  const body = {
    model: payload.model,
    messages: payload.messages,
    temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.8,
    stream: !!payload.stream
  };
  if (payload.max_tokens) body.max_tokens = payload.max_tokens;
  if (payload.json) body.response_format = { type: 'json_object' };
  /* 流式时让上游把 usage 一起发回来，前端才能显示 token 数与耗时 */
  if (body.stream && payload.usage !== false) body.stream_options = { include_usage: true };

  let upstream;
  const t0 = Date.now();
  try {
    upstream = await fetch(p.url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, p.headers(key)),
      body: JSON.stringify(body)
    });
  } catch (e) {
    return sendJson(res, 502, {
      error: '连接上游失败：' + e.message,
      diag: { kind: 'network', provider, url: p.url, ms: Date.now() - t0 }
    });
  }

  const rid = upstream.headers.get('x-request-id') || upstream.headers.get('x-openrouter-id') || '';

  if (!upstream.ok) {
    let text = '';
    try { text = await upstream.text(); } catch (e) {}
    let msg = text.slice(0, 800);
    try { const j = JSON.parse(text); msg = (j.error && (j.error.message || j.error)) || msg; } catch (e) {}
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
    Readable.fromWeb(upstream.body).pipe(res);
    return;
  }

  const data = await upstream.json();
  const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  const finish = (data.choices && data.choices[0] && data.choices[0].finish_reason) || '';
  sendJson(res, 200, {
    content,
    usage: data.usage || null,
    model: data.model || body.model,
    finish,
    requestId: rid,
    ms: Date.now() - t0
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      providers: {
        deepseek: !!keyOf('deepseek'),
        openrouter: !!keyOf('openrouter')
      }
    });
  }

  if (url === '/api/config') {
    if (req.method === 'GET') {
      return sendJson(res, 200, { providers: { deepseek: !!keyOf('deepseek'), openrouter: !!keyOf('openrouter') } });
    }
    if (req.method === 'POST') {
      let b;
      try { b = await readBody(req); } catch (e) { return sendJson(res, 400, { error: e.message }); }
      const provider = b.provider;
      if (!PROVIDERS[provider]) return sendJson(res, 400, { error: '未知的 provider' });
      const key = String(b.key || '').trim();
      if (!key) { delete keys[provider]; persist(); return sendJson(res, 200, { ok: true, cleared: true }); }
      keys[provider] = key;
      persist();
      return sendJson(res, 200, { ok: true, providers: { deepseek: !!keyOf('deepseek'), openrouter: !!keyOf('openrouter') } });
    }
  }

  if (url === '/api/llm' && req.method === 'POST') return handleLLM(req, res);

  if (req.method !== 'GET') { res.writeHead(405); res.end('Method not allowed'); return; }
  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  砚台 · 小说创作工作台');
  console.log('  http://' + HOST + ':' + PORT);
  console.log('');
  console.log('  DeepSeek Key   : ' + (keyOf('deepseek') ? '已配置' : '未配置（页面右上角「AI 设置」可填）'));
  console.log('  OpenRouter Key : ' + (keyOf('openrouter') ? '已配置' : '未配置'));
  console.log('');
});
