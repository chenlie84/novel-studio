/* 服务端安全回归：node --test
 * 不依赖任何第三方包，也不会碰你真实的 .llm-config.json（用临时端口 + 只读断言）。 */
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 18000 + Math.floor(Math.random() * 1000);
const CONFIG = path.join(ROOT, '.llm-config.json');
const HAD_CONFIG = fs.existsSync(CONFIG);
let child;

/* 原生 http.request：fetch 不允许自定义 Host 头 */
function req(method, urlPath, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, method, path: urlPath, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

test.before(async () => {
  child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { PORT: String(PORT), DEEPSEEK_API_KEY: '', OPENROUTER_API_KEY: '' }),
    stdio: 'ignore'
  });
  for (let i = 0; i < 40; i++) {
    try { await req('GET', '/api/health', { headers: { Host: '127.0.0.1:' + PORT } }); return; }
    catch (e) { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('服务没起来');
});

test.after(() => { if (child) child.kill(); });

const H = () => ({ Host: '127.0.0.1:' + PORT });

test('首页与前端资源可以正常访问', async () => {
  for (const f of ['/', '/app.js', '/ai.js', '/analyze.js', '/data.js', '/rank.js', '/app.css']) {
    const r = await req('GET', f, { headers: H() });
    assert.strictEqual(r.status, 200, f);
  }
});

test('密钥文件、服务端源码、隐藏文件、文档都不能被读到', async () => {
  fs.existsSync(CONFIG) || fs.writeFileSync(CONFIG, '{"deepseek":"sk-test-should-not-leak"}');
  try {
    for (const f of ['/.llm-config.json', '/.llm-config.example.json', '/server.js', '/.gitignore', '/README.md', '/LICENSE', '/.git/config', '/test/server.test.js']) {
      const r = await req('GET', f, { headers: H() });
      assert.strictEqual(r.status, 404, f + ' 应该 404，实际 ' + r.status);
      assert.ok(!/sk-test-should-not-leak/.test(r.text));
    }
  } finally { if (!HAD_CONFIG) fs.unlinkSync(CONFIG); }
});

test('路径穿越与编码绕过', async () => {
  for (const f of ['/../server.js', '/%2e%2e/server.js', '/screenshots/../server.js', '/screenshots/%2e%2e/.llm-config.json', '/app.js%00.png']) {
    const r = await req('GET', f, { headers: H() });
    assert.notStrictEqual(r.status, 200, f);
  }
});

test('畸形 URL 不会让进程崩溃', async () => {
  const r = await req('GET', '/%E0%A4%A', { headers: H() });
  assert.strictEqual(r.status, 404);
  const ok = await req('GET', '/api/health', { headers: H() });
  assert.strictEqual(ok.status, 200);
});

test('Host 不是本机：拒绝（防 DNS 重绑定）', async () => {
  const r = await req('GET', '/api/health', { headers: { Host: 'evil.example.com' } });
  assert.strictEqual(r.status, 403);
});

test('跨站 Origin 调接口：拒绝', async () => {
  const r = await req('POST', '/api/config', {
    headers: Object.assign(H(), { 'Content-Type': 'application/json', Origin: 'https://evil.example.com' }),
    body: JSON.stringify({ provider: 'deepseek', key: 'sk-attacker' })
  });
  assert.strictEqual(r.status, 403);
  assert.ok(!fs.existsSync(CONFIG) || !/sk-attacker/.test(fs.readFileSync(CONFIG, 'utf8')));
});

test('text/plain 的"简单请求"不能改 Key', async () => {
  const r = await req('POST', '/api/config', {
    headers: Object.assign(H(), { 'Content-Type': 'text/plain' }),
    body: JSON.stringify({ provider: 'deepseek', key: 'sk-attacker' })
  });
  assert.strictEqual(r.status, 415);
});

test('/api/llm 参数校验', async () => {
  const json = Object.assign(H(), { 'Content-Type': 'application/json' });
  let r = await req('POST', '/api/llm', { headers: json, body: JSON.stringify({ provider: '__proto__', model: 'x', messages: [{ role: 'user', content: 'hi' }] }) });
  assert.strictEqual(r.status, 400);
  r = await req('POST', '/api/llm', { headers: json, body: JSON.stringify({ provider: 'deepseek', messages: [{ role: 'user', content: 'hi' }] }) });
  assert.strictEqual(r.status, 400);
  r = await req('POST', '/api/llm', { headers: json, body: JSON.stringify({ provider: 'deepseek', model: 'm', messages: 'hi' }) });
  assert.strictEqual(r.status, 400);
  r = await req('POST', '/api/llm', { headers: json, body: JSON.stringify({ provider: 'deepseek', model: 'm', messages: [{ role: 'user', content: 'hi' }] }) });
  assert.strictEqual(r.status, 401, '没配 Key 应当 401');
});

test('损坏的 JSON 请求体返回 400 而不是崩溃', async () => {
  const r = await req('POST', '/api/llm', { headers: Object.assign(H(), { 'Content-Type': 'application/json' }), body: '{bad' });
  assert.strictEqual(r.status, 400);
  const ok = await req('GET', '/api/health', { headers: H() });
  assert.strictEqual(ok.status, 200);
});
