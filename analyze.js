/* 砚台 · 拆书分析：解析已有小说，反推结构与节奏 */

const AN_TEXT = {
  stop: new Set(('他们 我们 你们 自己 什么 这样 那样 此刻 然后 忽然 突然 此时 那个 这个 一下 一声 一句 两人 三人 众人 所有人 有人 没人 男人 女人 少年 少女 老者 对方 家伙 声音 脸色 心里 眼中 手里 身上 心里 起来 出来 过来 进去 回去 时候 地方 东西 事情 问题 办法 样子 感觉 意思 因为 所以 但是 可是 如果 就是 还是 只是 不过 而且 或者 虽然 已经 正在 一直 终于 立刻 马上 刚刚 现在 以后 之前 之后 一边 一边 有些 一点 这种 那种 这里 那里 哪里 怎么 为什么 什么样 是不是 能不能 要不要 会不会 知不道').split(/\s+/)),
  speakStrict: /([\u4e00-\u9fa5]{2,3}?)(说道|笑道|问道|答道|喊道|吼道|低声道|冷声道|开口道|开口|轻声说|说|道|问|答|喊|吼)[：:，,]?\s*[“"]/g,
  speakLoose: /([\u4e00-\u9fa5]{2,3}?)(说道|说着|笑道|问道|答道|喊道|吼道|低声道|冷声道|开口道|摇头道|点头道|叹了口气|皱眉道|沉声道|轻声说)/g,
  speakAfter: /[”"]\s*([\u4e00-\u9fa5]{2,3}?)(?=说道|说着|笑道|问道|说|道|问|答|笑|摇头|点头|皱眉|叹气)/g,
  actionColon: /([\u4e00-\u9fa5]{2,3}?)[^\n“”"：:]{0,12}[：:]\s*[“"]/g,
  colon: /([\u4e00-\u9fa5]{2,3})[：:]\s*[“"]/g,
  chapter: /^[ \t]*(第[0-9零一二三四五六七八九十百千两〇]{1,8}[章节回卷][^\n]{0,40}|[0-9]{1,4}[、.][ \t]*[^\n]{0,30}|Chapter[ \t]+[0-9]{1,4}[^\n]{0,30}|楔子|序章|引子|尾声|后记)[ \t]*$/gim,
  pay: /(打脸|震惊|不可能|跪下|废物|逆袭|突破|暴涨|碾压|耳光|闭嘴|傻眼|哗然|倒吸|天赋|觉醒|最强|秒杀|反杀|翻盘|满级|签到|奖励|金手指|瞪大|脸色一变|颤抖|愣住|呆住|失声|惊呼|炸开|沸腾|沸腾了|不可思议|全场|冷笑)/g
};

/* ---------- 读取 ---------- */

async function readNovelText(file) {
  if (/\.docx$/i.test(file.name)) return readDocx(file);
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  const bad = (text.match(/\uFFFD/g) || []).length;
  if (bad > text.length * 0.005) {
    try { text = new TextDecoder('gbk').decode(buf); } catch (e) {}
  }
  return text;
}

async function readDocx(file) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('这个浏览器不支持解析 docx，请另存为 txt 再传');
  }
  const u8 = new Uint8Array(await file.arrayBuffer());
  const files = await unzipDocx(u8);
  const key = Object.keys(files).find((k) => /word\/document\.xml$/.test(k));
  if (!key) throw new Error('这个 docx 里没有正文，可能是加密文件');
  const xml = files[key];
  const text = xml
    .replace(/<w:br\s*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  return text;
}

async function unzipDocx(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  const min = Math.max(0, u8.length - 66000);
  for (let i = u8.length - 22; i >= min; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('文件不是有效的 docx（zip 结构缺失）');

  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const out = {};

  for (let i = 0; i < count; i++) {
    if (off + 46 > u8.length || dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const compSize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const localOff = dv.getUint32(off + 42, true);
    const name = new TextDecoder('utf-8').decode(u8.subarray(off + 46, off + 46 + nameLen));

    if (/document\.xml$/.test(name)) {
      const lNameLen = dv.getUint16(localOff + 26, true);
      const lExtraLen = dv.getUint16(localOff + 28, true);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const comp = u8.subarray(start, start + compSize);
      out[name] = method === 0
        ? new TextDecoder('utf-8').decode(comp)
        : await inflateRaw(comp);
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return await new Response(stream).text();
}

/* ---------- 切章 ---------- */

function splitChapters(text) {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const marks = [];
  AN_TEXT.chapter.lastIndex = 0;
  let m;
  while ((m = AN_TEXT.chapter.exec(raw)) !== null) {
    marks.push({ title: m[1].trim().replace(/\s+/g, ' '), start: m.index, end: m.index + m[0].length });
  }

  if (marks.length >= 3) {
    const chapters = marks.map((mk, i) => ({
      no: i + 1,
      title: mk.title,
      content: raw.slice(mk.end, i + 1 < marks.length ? marks[i + 1].start : raw.length).trim()
    })).filter((c) => c.content.replace(/\s/g, '').length > 20);
    if (chapters.length >= 3) return chapters;
  }

  /* 没有章节标记：按 3000 字硬切 */
  const clean = raw.trim();
  const size = 3000;
  const parts = [];
  for (let i = 0; i < clean.length; i += size) {
    parts.push({ no: parts.length + 1, title: `片段 ${parts.length + 1}`, content: clean.slice(i, i + size) });
  }
  return parts.length ? parts : [{ no: 1, title: '全文', content: clean }];
}

/* ---------- 指标 ---------- */

function countChars(s) { return s.replace(/\s/g, '').length; }

function hookScore(tail) {
  let s = 0;
  if (/[？?]/.test(tail)) s += 22;
  if (/[！!]/.test(tail)) s += 14;
  if (/(突然|竟然|居然|没想到|不该|不可能|却|但是|然而|反而)/.test(tail)) s += 18;
  if (/(死|血|门|声音|电话|敲门|响|黑|影|笑|手|眼)/.test(tail)) s += 16;
  if (/(…|\.{3}|——)/.test(tail)) s += 12;
  return Math.min(100, s);
}

function payoffScore(content, words) {
  if (words < 150) return 0;
  AN_TEXT.pay.lastIndex = 0;
  const hits = (content.match(AN_TEXT.pay) || []).length;
  const density = hits / (words / 1000);
  return Math.min(100, Math.round(density * 14));
}

function dialogueRatio(content) {
  const quotes = content.match(/[“"][^”"]{1,300}[”"]/g) || [];
  const q = quotes.reduce((a, x) => a + countChars(x), 0);
  const all = countChars(content);
  return all ? q / all : 0;
}

function analyzeNovel(text, fileName) {
  const chapters = splitChapters(text);
  const rows = chapters.map((c) => {
    const words = countChars(c.content);
    const tail = c.content.slice(-260).replace(/\s+/g, ' ').trim();
    return {
      no: c.no,
      title: c.title,
      words,
      dialogue: dialogueRatio(c.content),
      hook: hookScore(tail),
      payoff: payoffScore(c.content, words),
      tail: tail.slice(-70)
    };
  });

  const total = rows.reduce((a, r) => a + r.words, 0);
  const dlg = rows.reduce((a, r) => a + r.dialogue * r.words, 0) / (total || 1);
  const payDensity = rows.reduce((a, r) => a + r.payoff, 0) / (rows.length || 1);

  return {
    name: fileName,
    totalWords: total,
    chCount: rows.length,
    avgWords: Math.round(total / (rows.length || 1)),
    dialogue: dlg,
    payAvg: Math.round(payDensity),
    chapters: rows,
    chars: extractChars(chapters),
    samples: chapters.slice(0, 3).map((c) => `【${c.title}】\n${c.content.slice(0, 1600)}`).join('\n\n'),
    at: Date.now()
  };
}

function extractChars(chapters) {
  const cnt = new Map();
  const first = new Map();
  const BAD = /[的了是在和与就都也把被给对从到而却这那我们你们他们没回抬看听想觉知会能要来往上下出去过很太还没再又才只更最地着]/;

  const add = (name, no, w) => {
    if (!name) return;
    const n = name.trim();
    if (n.length < 2 || n.length > 3) return;
    if (AN_TEXT.stop.has(n)) return;
    if (BAD.test(n)) return;
    cnt.set(n, (cnt.get(n) || 0) + w);
    if (!first.has(n)) first.set(n, no);
  };

  chapters.forEach((c) => {
    let m;
    AN_TEXT.speakStrict.lastIndex = 0;
    while ((m = AN_TEXT.speakStrict.exec(c.content)) !== null) add(m[1], c.no, 4);
    AN_TEXT.speakLoose.lastIndex = 0;
    while ((m = AN_TEXT.speakLoose.exec(c.content)) !== null) add(m[1], c.no, 2);
    AN_TEXT.speakAfter.lastIndex = 0;
    while ((m = AN_TEXT.speakAfter.exec(c.content)) !== null) add(m[1], c.no, 3);
    AN_TEXT.actionColon.lastIndex = 0;
    while ((m = AN_TEXT.actionColon.exec(c.content)) !== null) add(m[1], c.no, 3);
    AN_TEXT.colon.lastIndex = 0;
    while ((m = AN_TEXT.colon.exec(c.content)) !== null) add(m[1], c.no, 2);
  });

  return [...cnt.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 36)
    .map(([name, count]) => ({ name, count, firstCh: first.get(name) || 1 }));
}

/* ---------- 渲染 ---------- */

function renderAnalysis(r) {
  const box = document.getElementById('anResult');
  if (!box) return;
  if (!r) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');

  document.getElementById('anMeta').innerHTML = [
    ['文件', r.name],
    ['总字数', r.totalWords.toLocaleString() + ' 字'],
    ['章节数', r.chCount + ' 章'],
    ['平均章字数', r.avgWords.toLocaleString() + ' 字'],
    ['对话占比', Math.round(r.dialogue * 100) + '%'],
    ['爽点密度', r.payAvg + ' / 100']
  ].map(([k, v]) => `<div class="core-item"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');

  /* 节奏曲线 */
  const bars = [];
  let lowRun = 0;
  r.chapters.forEach((c) => {
    const score = c.payoff * 0.6 + c.hook * 0.4;
    lowRun = score < 32 ? lowRun + 1 : 0;
    const cls = lowRun >= 3 ? 'gap' : score >= 65 ? 's3' : score >= 40 ? 's2' : 's1';
    const h = Math.max(6, Math.round(10 + Math.sqrt(score / 100) * 140));
    bars.push(`<div class="bar ${cls}" style="height:${h}px" title="第${c.no}章 ${c.title}｜爽点 ${c.payoff}｜钩子 ${c.hook}"></div>`);
  });
  document.getElementById('anRhythm').innerHTML = bars.join('') || '<div class="rhythm-empty">没有数据</div>';

  /* 章节表 */
  document.getElementById('anChCount').textContent = `共 ${r.chCount} 章`;
  document.getElementById('anChapters').innerHTML = `
    <table>
      <thead><tr>
        <th style="width:46px">章</th><th style="width:150px">标题</th>
        <th style="width:70px">字数</th><th style="width:64px">对话</th>
        <th style="width:60px">钩子</th><th style="width:60px">爽点</th><th>章末</th>
      </tr></thead>
      <tbody>${r.chapters.map((c) => `
        <tr>
          <td class="no">${c.no}</td>
          <td class="ttl">${esc(c.title)}</td>
          <td class="no">${c.words.toLocaleString()}</td>
          <td class="no">${Math.round(c.dialogue * 100)}%</td>
          <td class="no">${c.hook}</td>
          <td class="no">${c.payoff}</td>
          <td class="hint">${esc(c.tail)}</td>
        </tr>`).join('')}</tbody>
    </table>`;

  /* 人物：有 AI 结论就用 AI 的，本地字面统计降为附注 */
  const aiChars = (r.ai && Array.isArray(r.ai.characters)) ? r.ai.characters : [];
  if (aiChars.length) {
    document.getElementById('anChars').innerHTML =
      `<div class="hint" style="margin-bottom:8px">下面是 AI 从正文判断出的角色配置，不是词频统计。</div>` +
      aiChars.map((c, i) => `
        <div class="an-char${i < 4 ? ' top' : ''}">
          <div class="n">${esc(c.name || '')}<span class="m" style="display:inline;margin-left:6px">${esc(c.role || '')}</span></div>
          <div class="m">${esc(c.function || '')}</div>
          ${c.motive ? `<div class="m">动机：${esc(c.motive)}</div>` : ''}
        </div>`).join('') +
      (r.chars.length
        ? `<div class="hint" style="grid-column:1/-1;margin-top:6px">字面出现频次参考：${r.chars.slice(0, 12).map((x) => `${esc(x.name)}(${x.count})`).join('、')}</div>`
        : '');
  } else {
    document.getElementById('anChars').innerHTML = r.chars.length
      ? `<div class="hint" style="grid-column:1/-1;margin-bottom:8px">还没跑 AI 拆解，下面是按对话归属统计的字面频次（不等于角色重要度）。</div>` +
        r.chars.map((c, i) => `
          <div class="an-char${i < 6 ? ' top' : ''}">
            <div class="n">${esc(c.name)}</div>
            <div class="m">出现 ${c.count} 次 · 首次第 ${c.firstCh} 章</div>
          </div>`).join('')
      : '<p class="hint">没识别出人物。可能这本主要是旁白，或对话标记太少。</p>';
  }
}

/* ---------- AI 拆解（主体能力） ---------- */

function novelPrompt(r) {
  const catalog = r.chapters.slice(0, 60).map((c) => {
    const tail = (c.tail || '').replace(/\s+/g, ' ').slice(-46);
    return `第${c.no}章 ${c.title}｜${c.words}字｜爽点${c.payoff}｜钩子${c.hook}｜章末：${tail}`;
  }).join('\n');

  return `下面是一本已连载小说的结构与正文，请做结构化拆书。

文件：${r.name}
总字数：${r.totalWords}　章数：${r.chCount}　平均章字数：${r.avgWords}　对话占比：${Math.round(r.dialogue * 100)}%

章节目录与每章指标：
${catalog}

正文样本（开头三章）：
${r.samples || '（无）'}

只输出如下 JSON，不要任何解释：
{
  "genre": "属于什么赛道，读者是谁，一句话",
  "sell": "一句话说清它靠什么留住人",
  "opening": "前三章分别做了什么，钩子埋在哪里",
  "rhythm": "多少章一个爽点，卷与卷怎么升级，低谷在哪几段",
  "characters": [{"name":"姓名","role":"主角/反派/盟友/导师/配角","function":"在故事里承担什么功能","motive":"他想要什么"}],
  "relations": [{"from":"人物名","to":"人物名","type":"亲属/师徒/盟友/敌对/利益/情感/上下级","note":"这段关系的张力在哪"}],
  "devices": ["可以直接搬到新书里的套路，每条一句"],
  "flaws": ["这本书自己踩的坑，新书要避开什么"],
  "lift": "如果要写同赛道，最该学的三件事"
}

约束：
- characters 给 5 到 10 个，必须是正文里真实出现过的人名，不许编造；角色定位按实际戏份判断。
- relations 的 from / to 必须出现在 characters 里，只写有戏剧张力的关系。
- devices 给 3 到 5 条，flaws 给 2 到 4 条。
- 每条判断都要能指回正文或章节目录，不要写放之四海皆准的空话。`;
}

const AI_AN_SECTIONS = [
  ['genre', '赛道判断'],
  ['sell', '核心卖点'],
  ['opening', '开篇设计'],
  ['rhythm', '节奏规律'],
  ['lift', '最该学的三件事']
];

function renderAiAnalysis(ai) {
  const box = document.getElementById('anAi');
  const panel = document.getElementById('anAiPanel');
  if (!box || !panel) return;
  if (!ai) { panel.classList.add('hidden'); box.innerHTML = ''; return; }
  panel.classList.remove('hidden');

  const sec = (k, label) => {
    const v = ai[k];
    if (!v) return '';
    return `<div class="an-block"><div class="k">${label}</div><div class="v">${esc(String(v))}</div></div>`;
  };

  const charsHtml = (ai.characters || []).length
    ? `<div class="an-block"><div class="k">人物配置</div>
        <div class="an-chars">${ai.characters.map((c) => `
          <div class="an-char top">
            <div class="n">${esc(c.name || '')}<span class="m" style="display:inline;margin-left:6px">${esc(c.role || '')}</span></div>
            <div class="m">${esc(c.function || '')}</div>
            ${c.motive ? `<div class="m">动机：${esc(c.motive)}</div>` : ''}
          </div>`).join('')}</div></div>` : '';

  const relHtml = (ai.relations || []).length
    ? `<div class="an-block"><div class="k">关系张力</div>
        <div class="rel-list">${ai.relations.map((x) => `
          <div class="an-rel">
            <b>${esc(x.from || '')}</b><span class="ar">→</span><b>${esc(x.to || '')}</b>
            <span class="rt">${esc(x.type || '')}</span>
            <span class="hint">${esc(x.note || '')}</span>
          </div>`).join('')}</div></div>` : '';

  const listHtml = (arr, label, cls) => (Array.isArray(arr) && arr.length)
    ? `<div class="an-block"><div class="k">${label}</div>
        <ul class="${cls}">${arr.map((x) => `<li>${esc(String(x))}</li>`).join('')}</ul></div>` : '';

  box.innerHTML = `<div class="an-ai-grid">
      ${AI_AN_SECTIONS.map(([k, l]) => sec(k, l)).join('')}
      ${charsHtml}
      ${relHtml}
      ${listHtml(ai.devices, '可复用套路', 'an-list')}
      ${listHtml(ai.flaws, '硬伤与坑', 'an-list warn')}
    </div>`;
}

function aiAnalysisText(ai) {
  if (!ai) return '';
  const L = [];
  AI_AN_SECTIONS.forEach(([k, l]) => { if (ai[k]) L.push(`【${l}】${ai[k]}`); });
  if ((ai.characters || []).length) {
    L.push('【人物配置】');
    ai.characters.forEach((c) => L.push(`- ${c.name}（${c.role || ''}）：${c.function || ''}${c.motive ? '｜动机：' + c.motive : ''}`));
  }
  if ((ai.relations || []).length) {
    L.push('【关系张力】');
    ai.relations.forEach((x) => L.push(`- ${x.from} → ${x.to}｜${x.type || ''}｜${x.note || ''}`));
  }
  if ((ai.devices || []).length) { L.push('【可复用套路】'); ai.devices.forEach((d) => L.push('- ' + d)); }
  if ((ai.flaws || []).length) { L.push('【硬伤与坑】'); ai.flaws.forEach((d) => L.push('- ' + d)); }
  return L.join('\n');
}

function normRole(r) {
  const s = String(r || '');
  for (let i = 0; i < ROLES.length; i++) if (s.indexOf(ROLES[i]) >= 0) return ROLES[i];
  return '配角';
}

function applyAiAnalysis() {
  const ai = S.analysis && S.analysis.ai;
  if (!ai) { alert('还没有 AI 拆解结果。'); return; }
  const chars = (ai.characters || []).filter((c) => c && c.name);
  if (!chars.length) { alert('AI 没有给出人物。'); return; }

  const names = chars.map((c) => String(c.name).trim());
  const relCount = (ai.relations || []).length;
  if (!confirm(`将导入 ${names.length} 个人物：\n${names.join('、')}\n\n以及 ${relCount} 条关系。\n\n重复的人名会自动跳过。继续？`)) return;

  let added = 0;
  const nameToId = {};
  S.chars.forEach((c) => { nameToId[c.name] = c.id; });

  chars.forEach((c, i) => {
    const name = String(c.name).trim();
    if (nameToId[name]) return;
    const id = 'c_an_' + Date.now().toString(36) + '_' + i;
    nameToId[name] = id;
    S.chars.push({
      id, name, alias: '',
      role: normRole(c.role),
      faction: '', tags: c.function || '', motive: c.motive || '',
      flaw: '', arc: '', catchphrase: '', firstCh: 1,
      notes: '拆书导入'
    });
    added++;
  });

  let relAdded = 0;
  (ai.relations || []).forEach((x) => {
    const f = nameToId[x.from], t = nameToId[x.to];
    if (!f || !t || f === t) return;
    const type = RELTYPES.indexOf(x.type) >= 0 ? x.type : '利益';
    if (S.rels.some((r) => r.from === f && r.to === t && r.type === type)) return;
    S.rels.push({ from: f, to: t, type, strength: 3, note: x.note || '', fromCh: 1, toCh: null });
    relAdded++;
  });

  save();
  renderCharList(); renderCharForm(); renderSideStats();
  buildGraph(); startSim(0.8); drawGraph();
  const info = document.getElementById('anInfo');
  if (info) info.textContent = `已导入 ${added} 个人物、${relAdded} 条关系，去「人物图谱」查看。`;
}

async function aiAnalyze(auto) {
  const r = S.analysis;
  if (!r) { if (!auto) alert('先上传一本书。'); return; }
  if (!(await ensureAI())) return;

  const btn = document.getElementById('aiAnalyzeBtn');
  if (btn) btn.classList.add('busy');

  try {
    const res = await runAiJob({
      title: 'AI 正在拆书',
      expectChars: 3000,
      steps: ['连接本地服务', '提交请求', '接收模型输出', '解析拆解 JSON', '写入拆书结果'],
      messages: () => [
        { role: 'system', content: '你是网文编辑，擅长拆解爆款的结构并把结论写成同行可以直接执行的东西。只输出 JSON。' },
        { role: 'user', content: novelPrompt(r) }
      ],
      params: { json: true, temperature: 0.55, maxTokens: 3200 },
      parse: (text) => parseJsonLoose(text),
      apply: (ai) => {
        S.analysis.ai = ai;
        save();
        renderAiAnalysis(ai);
        renderAnalysis(S.analysis);
      },
      doneText: `${r.chCount} 章已拆完`,
      closeAfter: 600,
      logMax: 5000
    });

    if (!res.ok) {
      const info = document.getElementById('anInfo');
      if (info) info.textContent = 'AI 拆解失败：' + res.error.message + '（结构指标仍可用，可点「AI 重新拆解」重试）';
    }
  } finally {
    if (btn) btn.classList.remove('busy');
  }
}

/* ---------- 内置示例（用于演示与自检） ---------- */

const AN_DEMO = `第一章 夜班
殡仪馆的夜班从十点开始。陈砚把最后一盏走廊灯关掉，只留停尸间门口那一盏。他在这里干了三年，早就习惯了福尔马林的味道。
凌晨一点十七分，三号柜传出指甲刮铁皮的声音。
陈砚握着登记本站在原地，没有动。他清楚地记得，三号柜是空的。
“谁在里面？”他问。
没有人回答。刮擦声停了两秒，又响起来，比刚才更急。
他走过去，手指搭在柜门把手上，冰凉。拉开的一瞬间，一股冷气扑到脸上，柜子里空荡荡的，只有一张对折的纸。
纸上写着六个字：明天别来上班。
陈砚笑了一下，把纸塞进口袋。他从来不信这个。
第二天早上七点，殡仪馆的电话打到他手机上。老周的声音在抖：“陈砚，你别过来，今天谁都别过来。”
电话那头传来一声闷响，然后是忙音。

第二章 打脸
赵鹏把车停在殡仪馆门口的时候，陈砚正在擦台阶。
“听说你昨天值夜班？”赵鹏摇下车窗，“馆长说了，这片以后归我管，你收拾东西走人。”
陈砚没抬头：“登记本上写着，昨晚三号柜有人动过。”
“什么三号柜？”赵鹏笑出声，“你他妈吓唬谁呢？”
陈砚站起来，把那张纸递过去。
赵鹏看了一眼，脸色变了。他捏着纸的手在抖，纸角被捏出褶皱。
“这字……这是馆长的字。”
“馆长上周火化了。”陈砚说。
赵鹏当场傻眼，后退两步撞在车门上，额头的汗顺着下巴往下掉。他张了张嘴，一个字也没说出来。
陈砚把纸收回来，折好，放回口袋。
“所以这地方现在归谁管，你再说一遍？”
赵鹏没有说话。他拉开车门，坐进去，发动了三次才把车开走。

第三章 规矩
老周在杂物间等陈砚，手里捏着半包烟，一根也没点。
“你知道三号柜为什么空着吗？”老周问。
陈砚摇头。
“因为里头那位，是自己走出来的。”老周把烟捏断了，“二十年前，也是夜班，也是凌晨一点十七分。值班的人第二天就不见了，登记本上多了六个字。”
“明天别来上班？”
老周抬头看他，眼睛里全是血丝：“你看见了？”
陈砚没答。他从口袋里掏出那张纸，摊在桌上。
纸的背面，还有一行更小的字，是用铅笔写的，几乎看不清：
“来的人，替我看三年。”
老周的手停在半空，烟丝从指缝里漏下来。
“三年……”他喃喃地说，“你来这儿，正好三年。”
窗外的路灯闪了一下，灭了。`;

function runDemoAnalysis() {
  const r = analyzeNovel(AN_DEMO, '示例 · 殡仪馆夜班（三章节选）');
  renderAnalysis(r);
  renderAiAnalysis(null);
  const info = document.getElementById('anInfo');
  if (info) info.textContent = '这是内置示例。上传你自己的文件会覆盖它。';
  return r;
}

/* ---------- 绑定 ---------- */

function handleNovelFile(file) {
  if (!file) return;
  const info = document.getElementById('anInfo');
  info.textContent = `正在解析 ${file.name} …`;

  readNovelText(file).then((text) => {
    if (!text || countChars(text) < 500) throw new Error('内容太少，至少 500 字');
    const result = analyzeNovel(text, file.name);
    S.analysis = result;
    save();
    renderAnalysis(result);
    renderAiAnalysis(null);
    info.textContent = `已解析 ${file.name} · ${result.totalWords.toLocaleString()} 字 · ${result.chCount} 章 · 平均每章 ${result.avgWords} 字`;

    /* 切章与指标只是预处理，结论交给 AI */
    if (AI.hasKey()) {
      info.textContent += ' · 正在交给 AI 拆解…';
      aiAnalyze(true);
    } else {
      info.textContent += ' · 没有配置 Key，AI 拆解不可用（右上角「AI 设置」）';
    }
  }).catch((e) => {
    info.textContent = '解析失败：' + e.message;
  });
}

(function bindAnalyze() {
  const zone = document.getElementById('dropZone');
  const input = document.getElementById('fileInput');
  if (!zone || !input) return;

  zone.onclick = () => input.click();
  input.onchange = () => { handleNovelFile(input.files[0]); input.value = ''; };

  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => {
    e.preventDefault(); zone.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => {
    e.preventDefault(); zone.classList.remove('over');
  }));
  zone.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleNovelFile(f);
  });

  const btn = document.getElementById('aiAnalyzeBtn');
  if (btn) btn.onclick = () => aiAnalyze(false);

  const applyBtn = document.getElementById('anApplyBtn');
  if (applyBtn) applyBtn.onclick = applyAiAnalysis;

  const copyBtn = document.getElementById('anCopyBtn');
  if (copyBtn) copyBtn.onclick = () => {
    const txt = aiAnalysisText(S.analysis && S.analysis.ai);
    if (!txt) { alert('还没有 AI 拆解结果。'); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
    copyBtn.textContent = '已复制';
    setTimeout(() => { copyBtn.textContent = '复制全文'; }, 1200);
  };
})();
