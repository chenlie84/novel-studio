/* 砚台 · 应用逻辑 */

const KEY = 'yantai.novel.v1';
const $ = (id) => document.getElementById(id);
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function cn(n) {
  n = Math.round(n);
  const d = '一二三四五六七八九';
  if (n <= 0) return '零';
  if (n < 10) return d[n - 1];
  if (n < 100) {
    const t = Math.floor(n / 10), o = n % 10;
    return (t === 1 ? '十' : d[t - 1] + '十') + (o ? d[o - 1] : '');
  }
  if (n < 1000) {
    const h = Math.floor(n / 100), r = n % 100;
    return d[h - 1] + '百' + (r === 0 ? '' : (r < 10 ? '零' + d[r - 1] : cn(r)));
  }
  return String(n);
}

function freshState() {
  return {
    project: { title: '未命名作品', genre: '都市脑洞', totalWan: 100, chapWords: 2000, vols: 6, density: 3, raw: '', hero: '' },
    core: null, volumes: [], chapters: [], chars: [], rels: [], fs: [], texts: {},
    favNames: [], theme: 'light', analysis: null,
    rank: { board: 'fanqie', genre: 'all', bench: [] },
    ui: { view: 'outline', selChar: null, selChapter: null, volFilter: 'all', chFilter: 500 }
  };
}

let S = freshState();

/* 把任意来源（localStorage / 导入的备份）的对象规整成合法状态 */
function normalizeState(o) {
  const base = freshState();
  const st = Object.assign(base, o);
  st.project = Object.assign(freshState().project, o.project || {});
  st.ui = Object.assign(freshState().ui, o.ui || {});
  st.rank = Object.assign(freshState().rank, o.rank || {});
  ['volumes', 'chapters', 'chars', 'rels', 'fs', 'favNames'].forEach((k) => { if (!Array.isArray(st[k])) st[k] = []; });
  if (!st.texts || typeof st.texts !== 'object' || Array.isArray(st.texts)) st.texts = {};
  if (!Array.isArray(st.rank.bench)) st.rank.bench = [];
  return st;
}

function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { return; }
  if (!raw) return;
  try {
    S = normalizeState(JSON.parse(raw));
    ensureRelIds();
    S.rels.forEach((r) => { if (r.fromCh == null) r.fromCh = 1; });
  } catch (e) {
    /* 读不出来：先把原文原样留一份，否则下一次 save() 会把唯一的残骸也覆盖掉 */
    console.warn('读取失败', e);
    try { localStorage.setItem(KEY + '.corrupt', raw); } catch (e2) {}
    S = freshState();
    LOAD_FAILED = true;
  }
}

let LOAD_FAILED = false;
let saveTimer = null;
let savePending = false;
let saveDisabled = false;     // 「清空」时置位，避免 beforeunload 把刚清掉的数据又写回去

function writeNow() {
  if (saveDisabled) return;
  clearTimeout(saveTimer);
  savePending = false;
  const t = $('saveState');
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
    if (t) {
      t.textContent = '已保存 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) +
        (LOAD_FAILED ? ' · 旧存档损坏，原文已另存' : '');
      t.classList.toggle('bad', LOAD_FAILED);
    }
  } catch (e) {
    const quota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
    if (t) {
      t.textContent = quota ? '存储已满！请立即点「备份」' : '保存失败，请点「备份」';
      t.classList.add('bad');
    }
    console.warn('保存失败', e);
  }
}

function save() {
  if (typeof ensureRelIds === 'function') ensureRelIds();
  clearTimeout(saveTimer);
  savePending = true;
  const t = $('saveState');
  if (t) t.textContent = '保存中…';
  saveTimer = setTimeout(writeNow, 260);
}

/* 260ms 防抖期间关页签 / 切走，最后几个字会丢——离开前同步落盘 */
function flushSave() { if (savePending) writeNow(); }
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });

/* 申请"持久存储"：浏览器清理空间时不会优先动这份数据（用户拒绝或不支持也无妨） */
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

/* ================= 关键词与文本工具 ================= */

function extractKeys(text, n) {
  n = n || 6;
  const CHAR_STOP = new Set('的了是在我他她它们这那就都也很还要能会把被给让对从到和与而却有没不想说发现每个上下来去过着得地之为以于所又再更最些里外中后前把将被给往向再');
  const clean = text.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, ' ');
  const segs = clean.split(/\s+/).filter((s) => s.length > 1);
  const cnt = new Map(), first = new Map();
  let p = 0;
  segs.forEach((seg) => {
    for (let len = 4; len >= 2; len--) {
      for (let i = 0; i + len <= seg.length; i++) {
        const w = seg.slice(i, i + len);
        if (DATA.stopwords.indexOf(w) >= 0) continue;
        let bad = false;
        for (const ch of w) { if (CHAR_STOP.has(ch)) { bad = true; break; } }
        if (bad) continue;
        if (!cnt.has(w)) { cnt.set(w, 0); first.set(w, p++); }
        cnt.set(w, cnt.get(w) + 1);
      }
    }
  });
  const arr = [...cnt.entries()].sort((a, b) => {
    const sa = a[1] * 6 + a[0].length * 4 - first.get(a[0]) * 0.3;
    const sb = b[1] * 6 + b[0].length * 4 - first.get(b[0]) * 0.3;
    return sb - sa;
  });
  const out = [];
  for (const [w] of arr) {
    if (out.length >= n) break;
    if (out.some((o) => o.indexOf(w) >= 0 || w.indexOf(o) >= 0)) continue;
    out.push(w);
  }
  return out;
}

function fillTpl(str, ctx) {
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (ctx[k] == null ? m : ctx[k]));
}

/* 章标题：模板里的 {n} 要填上，否则章表里会出现字面量「第{n}条规矩」 */
function chapterTitle(no) {
  const tpl = DATA.chapterTitleTpl[no % DATA.chapterTitleTpl.length];
  return fillTpl(tpl, { n: cn(Math.ceil(no / DATA.chapterTitleTpl.length)) });
}

function oneLine(raw, keys) {
  const s = raw.trim().replace(/\s+/g, ' ');
  const first = s.split(/[。！？!?]/)[0] || s;
  return first.length > 46 ? first.slice(0, 46) + '…' : first;
}

/* ================= 取名核心 ================= */

function pickSurname(kindPref) {
  const k = kindPref || 'random';
  if (k === 'compound') return rnd(DATA.surnames.compound);
  if (k === 'ancient') return rnd(DATA.surnames.ancient);
  if (k === 'common') return rnd(DATA.surnames.common);
  return Math.random() < 0.06 ? rnd(DATA.surnames.compound) : rnd(DATA.surnames.common);
}

function pickGiven(pref) {
  const pool = [];
  const styles = pref.style && pref.style !== '随机' ? [pref.style] : ['冷峻', '儒雅', '锋锐', '温和', '现代'];
  styles.forEach((s) => { if (DATA.givenChars[s]) pool.push(...DATA.givenChars[s].split('')); });
  if (pref.gender === '女') {
    if (pref.style && pref.style !== '随机' && DATA.givenChars[pref.style]) {
      pool.length = 0;
      pool.push(...DATA.givenChars[pref.style].split(''), ...DATA.givenChars.女性.split(''));
    } else {
      pool.length = 0;
      pool.push(...DATA.givenChars.女性.split(''));
    }
  }
  if (pref.gender === '中') pool.push(...DATA.givenChars.单字.split(''));

  const ban = (pref.ban || '').split('').filter(Boolean);
  const len = pref.len === '1' ? 1 : pref.len === '2' ? 2 : (Math.random() < 0.62 ? 2 : 1);
  let name = '';
  for (let t = 0; t < 40; t++) {
    name = '';
    for (let i = 0; i < len; i++) name += rnd(pool);
    if (name.length !== len) continue;
    if (ban.length && name.split('').some((c) => ban.indexOf(c) >= 0)) continue;
    if (len === 2 && name[0] === name[1]) continue;
    if (DATA.stopwords.indexOf(name) >= 0) continue;
    break;
  }
  return name;
}

function genPerson(pref) {
  const sur = pickSurname(pref.sur);
  const given = pickGiven(pref);
  return { text: sur + given, sub: (pref.style && pref.style !== '随机' ? pref.style : '') + (pref.gender === '女' ? ' 女' : pref.gender === '男' ? ' 男' : '') };
}

function genPlace(pref) {
  const tone = pref.style || '随机';
  const pre = DATA.place.pre.split(''), suf = DATA.place.suf.split('');
  const head = tone === '城镇' ? '云渡望棠安' : tone === '山野' ? '青黑断落寒雾' : tone === '水域' ? '沉幽渡泽' : DATA.place.pre;
  return { text: rnd(head.split('')) + rnd(suf), sub: tone };
}

function genSect(pref) {
  const p = rnd(DATA.sect.pre), s = rnd(DATA.sect.suf);
  const tone = pref.style || '随机';
  const suffix = tone === '邪道' ? rnd(['教', '殿', '府']) : tone === '中立' ? rnd(['阁', '院', '堂']) : s;
  return { text: p + suffix, sub: tone };
}

function genSkill(pref) {
  const a = rnd(DATA.skill.pre), b = rnd(DATA.skill.mid), c = rnd(DATA.skill.suf);
  const mode = pref.style || '随机';
  const text = mode === '招式' ? b + c : mode === '身法' ? b + rnd(['步', '影', '踪']) : (Math.random() < 0.65 ? a + b + c : b + c);
  return { text, sub: mode };
}

function genOrg(pref) {
  const a = rnd(DATA.org.pre.split('')), b = rnd(DATA.org.mid.split('')), c = rnd(DATA.org.suf);
  return { text: a + b + c, sub: c };
}

function genTitle(pref) {
  const pack = DATA.genrePack[S.project.genre] || DATA.genrePack['都市脑洞'];
  const act = rnd(['送外卖', '值夜班', '扫地', '摆摊', '写代码', '守门', '跑单', '查账']);
  const target = rnd(['规则', '天骄', '老板', '考核', '生死簿', '排行榜', '老宅', '整个行业']);
  const res = rnd(['掀翻', '打穿', '重写', '盘活', '买下', '清零']);
  const ident = rnd(['外卖员', '保安', '实习生', '护工', '打工人', '网管', '司机']);
  const item = rnd(pack.item ? [pack.item] : ['手机']);
  const twist = rnd(['第一天就上了热搜', '全城都慌了', '没人敢信', '领导连夜开会']);
  const num = ri(3, 17);
  const ctx = { act, target, res, ident, place: rnd(pack.place), item, twist, num };
  return { text: fillTpl(rnd(DATA.titleTpl), ctx), sub: '番茄风' };
}

const NAME_GEN = { person: genPerson, place: genPlace, sect: genSect, skill: genSkill, org: genOrg, title: genTitle };

/* ================= 大纲引擎 ================= */

const BEAT_LEVEL = {
  climax: 4, face: 3, gain: 3, ally: 2, twist: 2, reveal: 2,
  clash: 1, press: 1, probe: 1, plant: 1, expand: 1, betray: 1, loss: 0, rest: 0
};

const BEAT_LABEL = {
  climax: '卷高潮', face: '打脸', gain: '收获', ally: '结盟', twist: '反转', reveal: '揭秘',
  clash: '冲突', press: '压迫', probe: '试探', plant: '埋伏笔', expand: '扩张', betray: '背叛', loss: '失去', rest: '休整'
};

function pickVolTpl(i, n) {
  const r = n <= 1 ? 1 : i / (n - 1);
  if (r < 0.14) return DATA.volumeTpl[0];
  if (r < 0.40) return DATA.volumeTpl[1];
  if (r < 0.60) return DATA.volumeTpl[2];
  if (r < 0.78) return DATA.volumeTpl[3];
  if (r < 0.95) return DATA.volumeTpl[4];
  return DATA.volumeTpl[5];
}

function beatFunc(vi, i, count, density) {
  if (i === count - 1) return 'climax';
  if (i === count - 2 && count > 6) return 'twist';
  if (i === 0) return 'press';
  if (i === 1) return 'probe';
  if (i === 2) return 'gain';
  if (i % (density * 3) === 0) return 'face';
  if (i % density === 0) return Math.random() < 0.6 ? 'gain' : 'ally';
  if (vi === 1 && i === Math.floor(count * 0.5)) return 'expand';
  if (vi >= 3 && i === Math.floor(count * 0.35)) return 'reveal';
  const filler = ['press', 'probe', 'clash', 'plant', 'probe', 'clash', 'rest', 'probe', 'clash', 'expand'];
  return filler[i % filler.length];
}

function buildOutline() {
  const raw = $('rawOutline').value.trim();
  if (raw.length < 20) { alert('大纲太短了，至少写 20 个字，把人物、处境、异常各说一句。'); return; }
  if (S.chapters.length && !confirmOverwriteText()) return;

  const genre = $('pGenre').value;
  const totalWan = clamp(+$('pTotal').value || 100, 10, 500);
  const chapWords = clamp(+$('pChapWords').value || 2000, 1500, 4000);
  const volCount = clamp(+$('pVols').value || 6, 3, 10);
  const density = +$('pDensity').value || 3;
  const heroIn = $('pHero').value.trim();

  const pack = DATA.genrePack[genre] || DATA.genrePack['都市脑洞'];
  const keys = extractKeys(raw, 7);
  const totalCh = Math.max(volCount * 8, Math.round((totalWan * 10000) / chapWords));
  const hero = heroIn || (genPerson({ style: pack.tone === '古风' ? '儒雅' : '冷峻', gender: '男', len: '2' }).text);

  S.project = { title: S.project.title, genre, totalWan, chapWords, vols: volCount, density, raw, hero };

  const enemyName = genPerson({ style: '阴鸷', gender: '男', len: '2' }).text;
  const allyName = genPerson({ style: pack.tone === '古风' ? '温和' : '现代', gender: '女', len: '2' }).text;

  /* --- 核心设定 --- */
  const k1 = keys[0] || '那件不该存在的事';
  const k2 = keys[1] || '规则';
  S.core = {
    oneLine: oneLine(raw, keys),
    gold: `${hero}能看见${k1}的“${k2}”，每一次动用都要付出一样他舍不得的东西`,
    conflict: `${hero}想保住身边的人，而${enemyName}代表的那套规矩不允许有人例外`,
    keys: keys.join(' / '),
    turn1: `约第 ${Math.round(totalCh * 0.28)} 章前后：${hero}发现自己不是唯一的例外，前一个例外已经被抹掉`,
    turn2: `中点反转：一直帮他的人，才是最初把他推上这条路的人`,
    turn3: `约第 ${Math.round(totalCh * 0.72)} 章前后：他赖以生存的能力，本身就是对方设的局`,
    dark: `暗黑时刻：${hero}失去能力与盟友，退回到最初的地方，用最笨的方式重来`,
    ending: `终局：他不摧毁规则，而是把自己变成新规则的第一个例外——代价是没人再记得他做过什么`,
    enemy: enemyName, ally: allyName
  };

  /* --- 卷纲 --- */
  const weights = [];
  for (let i = 0; i < volCount; i++) weights.push(1 + 0.3 * Math.sin((Math.PI * i) / Math.max(1, volCount - 1)));
  const wSum = weights.reduce((a, b) => a + b, 0);
  const vols = [];
  let acc = 0;
  for (let i = 0; i < volCount; i++) {
    let n = i === volCount - 1 ? totalCh - acc : Math.max(8, Math.round((totalCh * weights[i]) / wSum));
    const tpl = pickVolTpl(i, volCount);
    const from = acc + 1, to = acc + n;
    const place = rnd(pack.place), org = rnd(pack.org);
    vols.push({
      id: 'v' + i, idx: i,
      name: `卷${cn(i + 1)} · ${tpl.name.split('·')[1].trim()}`,
      fromCh: from, toCh: to,
      goal: fillTpl(tpl.goal, { hero, enemy: enemyName, place, org }),
      arc: tpl.arc,
      climax: fillTpl(tpl.climax, { hero, enemy: enemyName, place, org }),
      enemy: ['初遇者', '同阶对手', '组织打手', '内鬼', '旧神代理人', '承规者'][Math.min(i, 5)],
      map: place + ' / ' + org,
      place, org
    });
    acc = to;
  }

  /* --- 章纲 --- */
  const chapters = [];
  vols.forEach((v, vi) => {
    const count = v.toCh - v.fromCh + 1;
    const places = [v.place, rnd(pack.place), rnd(pack.place)];
    for (let i = 0; i < count; i++) {
      const no = v.fromCh + i;
      const func = beatFunc(vi, i, count, density);
      const pool = DATA.beatTpl[func] || DATA.beatTpl.press;
      const t = rnd(pool);
      const ctx = {
        hero, enemy: enemyName, ally: allyName,
        place: places[i % places.length],
        org: v.org,
        item: pack.item || '信物',
        target: i % 3 === 0 ? allyName : rnd(['那个人', '名单上的人', '最后一个证人', '老周'])
      };
      chapters.push({
        no, volId: v.id, func, level: BEAT_LEVEL[func],
        title: chapterTitle(no),
        pov: func === 'climax' && vi > 2 ? '双视角' : hero,
        goal: fillTpl(t.goal, ctx),
        obstacle: fillTpl(t.obstacle, ctx),
        turn: fillTpl(t.turn, ctx),
        payoff: fillTpl(t.payoff, ctx),
        hook: fillTpl(t.hook, ctx),
        words: chapWords
      });
    }
  });

  S.volumes = vols;
  S.chapters = chapters;
  S.core.totalCh = totalCh;
  S.ui.selChapter = 1;

  /* --- 初始人物 --- */
  S.chars = [
    { id: 'c_hero', name: hero, alias: '', role: '主角', faction: '自方', tags: '能看见规则的普通人,嘴毒心软', motive: '保住身边的人', flaw: '总想一个人扛', arc: '从自保到定规矩', catchphrase: '这事我来', firstCh: 1, notes: '' },
    { id: 'c_enemy', name: enemyName, alias: '', role: '反派', faction: '承规方', tags: '规矩的执行者,笑面', motive: '维护“例外不存在”的秩序', flaw: '不肯承认自己也曾是例外', arc: '从执法者到被自己的规矩吞掉', catchphrase: '规矩就是规矩', firstCh: Math.max(2, Math.round(totalCh * 0.06)), notes: '' },
    { id: 'c_ally', name: allyName, alias: '', role: '盟友', faction: '自方', tags: '懂行,信息源', motive: '查清家里那桩旧事', flaw: '关键时刻会退', arc: '从旁观到并肩', catchphrase: '我早说过', firstCh: Math.max(2, Math.round(totalCh * 0.03)), notes: '' }
  ];
  S.ui.selChar = 'c_hero';
  S.rels = [
    { from: 'c_hero', to: 'c_enemy', type: '敌对', strength: 4, note: '立场的正面对撞', both: true, fromCh: 1, toCh: null },
    { from: 'c_hero', to: 'c_ally', type: '盟友', strength: 3, note: '交易起家，暂时同路', fromCh: Math.max(2, Math.round(totalCh * 0.02)), toCh: Math.round(totalCh * 0.34) },
    { from: 'c_hero', to: 'c_ally', type: '敌对', strength: 4, note: '第 170 章摊牌，从此反目', fromCh: Math.round(totalCh * 0.34) + 1, toCh: null },
    { from: 'c_ally', to: 'c_hero', type: '利益', strength: 2, note: '一边并肩一边留后手', fromCh: 1, toCh: null }
  ];

  save();
  renderAll();
  $('outlineResult').classList.remove('hidden');
  $('genInfo').textContent = `已生成 ${totalCh} 章 / ${volCount} 卷 / 约 ${totalWan} 万字`;
  $('outlineResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ================= 渲染：大纲 ================= */

function renderCore() {
  if (!S.core) return;
  const c = S.core;
  const items = [
    ['一句话核心梗', c.oneLine, true],
    ['金手指公式', c.gold, true],
    ['核心冲突', c.conflict, true],
    ['提取到的关键词', c.keys],
    ['第一次大转折', c.turn1],
    ['中点反转', c.turn2],
    ['第二次大转折', c.turn3],
    ['暗黑时刻', c.dark],
    ['结局', c.ending, true]
  ];
  $('coreCard').innerHTML = items.map(([k, v, wide]) =>
    `<div class="core-item${wide ? ' wide' : ''}"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`
  ).join('');
}

function renderVolumes() {
  const box = $('volumeList');
  if (!S.volumes.length) { box.innerHTML = ''; return; }
  box.innerHTML = S.volumes.map((v) => `
    <div class="vol-item${v.idx === 0 ? ' open' : ''}" data-vol="${v.id}">
      <div class="vol-head">
        <span class="vol-name">${esc(v.name)}</span>
        <span class="vol-range">第 ${v.fromCh}–${v.toCh} 章 · ${v.toCh - v.fromCh + 1} 章</span>
      </div>
      <div class="vol-body">
        <div class="vol-field"><div class="k">本卷目标</div><div class="v">${esc(v.goal)}</div></div>
        <div class="vol-field"><div class="k">对手层级</div><div class="v">${esc(v.enemy)}</div></div>
        <div class="vol-field"><div class="k">地图 / 势力</div><div class="v">${esc(v.map)}</div></div>
        <div class="vol-field"><div class="k">人物弧光</div><div class="v">${esc(v.arc)}</div></div>
        <div class="vol-field"><div class="k">卷末高潮</div><div class="v">${esc(v.climax)}</div></div>
      </div>
    </div>`).join('');

  box.querySelectorAll('.vol-head').forEach((el) => {
    el.onclick = () => el.parentElement.classList.toggle('open');
  });

  const sel = $('chapterVolFilter');
  sel.innerHTML = '<option value="all">全部卷</option>' +
    S.volumes.map((v) => `<option value="${v.id}">${esc(v.name)}（${v.fromCh}-${v.toCh}）</option>`).join('');
  if (S.ui.volFilter !== 'all') sel.value = S.ui.volFilter;
}

function renderChapters() {
  const filter = S.ui.volFilter || 'all';
  const list = filter === 'all' ? S.chapters : S.chapters.filter((c) => c.volId === filter);
  $('chapterCount').textContent = `共 ${list.length} 章 · 合计约 ${((list.length * (S.project.chapWords || 2000)) / 10000).toFixed(1)} 万字`;

  const rows = list.map((c) => `
    <tr data-ch="${c.no}">
      <td class="no">${c.no}</td>
      <td class="ttl">${esc(c.title)}</td>
      <td class="pov">${esc(c.pov)}</td>
      <td>${esc(c.goal)}</td>
      <td>${esc(c.obstacle)}</td>
      <td>${esc(c.turn)}</td>
      <td><span class="tag pay">${esc(BEAT_LABEL[c.func] || c.func)}</span></td>
      <td>${esc(c.hook)}</td>
    </tr>`).join('');

  $('chapterTable').innerHTML = `
    <table>
      <thead><tr>
        <th style="width:46px">章</th><th style="width:104px">标题</th><th style="width:64px">视角</th>
        <th>本章目标</th><th>阻碍</th><th>转折</th><th style="width:62px">功能</th><th>章末钩子</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  $('chapterTable').querySelectorAll('tr[data-ch]').forEach((tr) => {
    tr.onclick = () => {
      S.ui.selChapter = +tr.dataset.ch;
      switchView('write');
      loadChapterToEditor(+tr.dataset.ch);
    };
  });
}

function renderBeatMap() {
  if (!S.chapters.length) { $('beatMap').innerHTML = ''; return; }
  const cells = [];
  let gapRun = 0;
  S.chapters.forEach((c) => {
    const isGap = c.level <= 1;
    gapRun = isGap ? gapRun + 1 : 0;
    const cls = c.level >= 4 ? 'l4' : c.level === 3 ? 'l3' : c.level === 2 ? 'l2' : c.level === 1 ? 'l1' : (gapRun >= 5 ? 'gap' : '');
    const title = `第${c.no}章 ${c.title} · ${BEAT_LABEL[c.func] || c.func}` + (cls === 'gap' ? ' · 连续无爽点' : '');
    cells.push(`<div class="beat-cell ${cls}" title="${esc(title)}"></div>`);
  });
  const gaps = S.chapters.filter((c) => c.level === 0).length;
  $('beatMap').innerHTML = cells.join('') + `
    <div class="beat-legend" style="width:100%">
      <span><i style="background:#C0DD97"></i>过渡</span>
      <span><i style="background:#97C459"></i>小爽</span>
      <span><i style="background:#639922"></i>强爽</span>
      <span><i style="background:#BA7517"></i>爆点</span>
      <span><i style="background:#FCEBEB;border:1px solid #A32D2D"></i>断期待</span>
      <span style="margin-left:auto">休整章 ${gaps} 个</span>
    </div>`;
}

/* ================= 人物 ================= */

const ROLE_COLOR = { '主角': '#185FA5', '反派': '#A32D2D', '盟友': '#3B6D11', '导师': '#BA7517', '配角': '#888780', '对照组': '#7F77DD' };
const REL_COLOR = { '亲属': '#7F77DD', '师徒': '#BA7517', '盟友': '#3B6D11', '敌对': '#A32D2D', '利益': '#888780', '情感': '#D4537E', '上下级': '#378ADD' };
const ROLES = ['主角', '反派', '盟友', '导师', '配角', '对照组'];
const RELTYPES = ['亲属', '师徒', '盟友', '敌对', '利益', '情感', '上下级'];

function charById(id) { return S.chars.find((c) => c.id === id); }

function renderCharList() {
  const list = S.chars.slice().sort((a, b) => (a.firstCh || 1) - (b.firstCh || 1));
  $('charList').innerHTML = list.map((c) => `
    <li data-id="${c.id}" class="${S.ui.selChar === c.id ? 'sel' : ''}">
      <span class="char-dot" style="background:${ROLE_COLOR[c.role] || '#888780'}"></span>
      <span>${esc(c.name || '未命名')}</span>
      <span class="char-role">${esc(c.role || '')}</span>
    </li>`).join('') || '<li class="hint">还没有人物，点右上角新增</li>';

  $('charList').querySelectorAll('li[data-id]').forEach((li) => {
    li.onclick = () => { S.ui.selChar = li.dataset.id; renderCharList(); renderCharForm(); highlightNode(li.dataset.id); };
  });
}

function renderCharForm() {
  const box = $('charForm');
  const c = S.ui.selChar ? charById(S.ui.selChar) : null;
  if (!c) {
    $('charEditTitle').textContent = '人物卡';
    box.innerHTML = '<p class="hint">在左侧或图谱里选一个人物。</p>';
    return;
  }
  $('charEditTitle').textContent = c.name || '人物卡';
  const groups = relGroupsFor(c.id);
  const others = S.chars.filter((x) => x.id !== c.id);
  const curCh = S.ui.chFilter || 9999;

  box.innerHTML = `
    <label>姓名<input data-f="name" value="${esc(c.name)}"></label>
    <div class="two">
      <label>身份/马甲<input data-f="alias" value="${esc(c.alias)}"></label>
      <label>定位<select data-f="role">${ROLES.map((r) => `<option ${r === c.role ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
    </div>
    <div class="two">
      <label>阵营<input data-f="faction" value="${esc(c.faction)}"></label>
      <label>登场章<input data-f="firstCh" type="number" min="1" value="${c.firstCh || 1}"></label>
    </div>
    <label>标签（逗号分隔）<input data-f="tags" value="${esc(c.tags)}"></label>
    <label>核心动机<input data-f="motive" value="${esc(c.motive)}"></label>
    <label>性格缺陷<input data-f="flaw" value="${esc(c.flaw)}"></label>
    <label>成长弧光<input data-f="arc" value="${esc(c.arc)}"></label>
    <label>口头禅<input data-f="catchphrase" value="${esc(c.catchphrase)}"></label>
    <label>备注<textarea data-f="notes" rows="2">${esc(c.notes)}</textarea></label>
    <div class="relation-box">
      <div class="k" style="font-size:11px;color:var(--text3);margin-bottom:6px">
        关系<span class="hint" style="margin-left:6px">可分段 · 点「断」改性质</span>
      </div>
      ${groups.map((g) => {
        const isOut = g.from === c.id;
        const other = charById(isOut ? g.to : g.from);
        const anyBoth = g.segs.some((s) => s.both);
        const sym = anyBoth ? '⇄' : (isOut ? '→' : '←');
        const rev = !anyBoth && S.rels.some((x) => x.from === g.to && x.to === g.from);
        const live = g.segs.find((s) => relAliveAt(s, curCh));

        const segRows = g.segs.map((s) => {
          const alive = relAliveAt(s, curCh);
          const active = live && live.id === s.id;
          return `<div class="rel-seg${alive ? '' : ' off'}${active ? ' active' : ''}">
            <div class="rel-seg-line">
              <span class="rel-type">${esc(s.type)}</span>
              <span class="rel-str" title="强度 ${s.strength || 1}">${'◆'.repeat(s.strength || 1)}</span>
              <span class="rel-acts">
                <button class="rel-mini" data-splitbtn="${s.id}" title="从某一章起改变关系性质">断</button>
                <button class="rel-mini" data-delrel="${s.id}" title="删除这一段">×</button>
              </span>
            </div>
            <div class="rel-span">
              <span>第</span>
              <input type="number" min="1" data-rfrom="${s.id}" value="${s.fromCh || 1}" title="本段起始章">
              <span>–</span>
              <input type="number" min="1" data-rto="${s.id}" value="${s.toCh || ''}" placeholder="至今" title="本段结束章，留空=一直有效">
              <span>章</span>
            </div>
            <div class="rel-split hidden" data-splitform="${s.id}">
              <span>第</span>
              <input type="number" min="1" data-splitch="${s.id}" value="${Math.min(curCh === 9999 ? 1 : curCh, 9999)}">
              <span>章起改为</span>
              <select data-splittype="${s.id}">${RELTYPES.map((t) => `<option ${t === s.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
              <button class="btn small primary" type="button" data-dosplit="${s.id}">断代</button>
            </div>
          </div>`;
        }).join('');

        return `<div class="rel-item" data-grp="${g.key}">
          <div class="rel-row${anyBoth ? ' mutual' : ''}">
            <span class="rel-dir" title="${anyBoth ? '双向关系' : (isOut ? '我 → 对方' : '对方 → 我')}">${sym}</span>
            <span class="rel-name" title="${esc((live && live.note) || '')}">${esc(other ? other.name : '?')}</span>
            ${g.segs.length > 1 ? `<span class="rel-seg-badge" title="这段关系被切成了 ${g.segs.length} 段">${g.segs.length} 段</span>` : ''}
            ${rev ? '<span class="rel-tag" title="另有反向关系">对</span>' : ''}
            <button class="rel-mini${anyBoth ? ' on' : ''}" data-bidir="${g.key}" title="切换单向/双向">⇄</button>
          </div>
          ${segRows}
        </div>`;
      }).join('') || '<p class="hint">暂无关系</p>'}
      <div class="rel-row" style="margin-top:8px">
        <select id="newRelTo" style="flex:1;border:1px solid var(--border);border-radius:6px;padding:4px;background:var(--panel2);font-size:12px">
          ${others.map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}
        </select>
        <select id="newRelType" style="border:1px solid var(--border);border-radius:6px;padding:4px;background:var(--panel2);font-size:12px">
          ${RELTYPES.map((t) => `<option>${t}</option>`).join('')}
        </select>
        <label class="rel-check" title="双向：两人之间是同一段关系"><input type="checkbox" id="newRelBoth">双向</label>
        <button id="addRelBtn" class="btn small" type="button">加</button>
      </div>
    </div>
    <button id="delCharBtn" class="btn small danger" type="button" style="margin-top:10px">删除人物</button>`;

  box.querySelectorAll('[data-f]').forEach((el) => {
    el.oninput = () => {
      const f = el.dataset.f;
      c[f] = f === 'firstCh' ? (+el.value || 1) : el.value;
      if (f === 'name') { $('charEditTitle').textContent = c.name; renderCharList(); drawGraph(); }
      else renderCharList();
      if (f !== 'name') drawGraph();
      save();
    };
  });

  box.querySelectorAll('[data-rfrom]').forEach((el) => {
    el.onchange = () => {
      const r = S.rels.find((x) => x.id === el.dataset.rfrom);
      if (!r) return;
      r.fromCh = Math.max(1, +el.value || 1);
      if (r.toCh && r.toCh < r.fromCh) r.toCh = null;
      save(); buildGraph(); startSim(0.25); drawGraph(); renderCharForm();
    };
  });

  box.querySelectorAll('[data-rto]').forEach((el) => {
    el.onchange = () => {
      const r = S.rels.find((x) => x.id === el.dataset.rto);
      if (!r) return;
      const v = +el.value || 0;
      r.toCh = v > 0 ? v : null;
      save(); buildGraph(); startSim(0.25); drawGraph(); renderCharForm();
    };
  });

  box.querySelectorAll('[data-delrel]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.delrel;
      S.rels = S.rels.filter((r) => r.id !== id);
      save(); renderCharForm(); buildGraph(); startSim(0.4); drawGraph();
    };
  });

  /* ✂ 展开断代表单 */
  box.querySelectorAll('[data-splitbtn]').forEach((b) => {
    b.onclick = () => {
      const f = box.querySelector(`[data-splitform="${b.dataset.splitbtn}"]`);
      if (f) f.classList.toggle('hidden');
    };
  });

  /* 断代：在某章切开，后段换成新性质 */
  box.querySelectorAll('[data-dosplit]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.dosplit;
      const form = box.querySelector(`[data-splitform="${id}"]`);
      const ch = +box.querySelector(`[data-splitch="${id}"]`).value || 1;
      const type = box.querySelector(`[data-splittype="${id}"]`).value;
      const nu = splitRelAt(id, ch, type);
      if (!nu) return;
      ensureRelIds();
      save(); renderCharForm(); buildGraph(); startSim(0.4); drawGraph();
      if (form) form.classList.add('hidden');
    };
  });

  box.querySelectorAll('[data-bidir]').forEach((b) => {
    b.onclick = () => {
      const [f, t] = b.dataset.bidir.split('>');
      const segs = S.rels.filter((x) => x.from === f && x.to === t);
      if (!segs.length) return;
      const on = segs.some((s) => s.both);
      if (on) {
        segs.forEach((s) => { delete s.both; });
      } else {
        /* 反向同类型段合并成双向，避免重复连线 */
        const types = new Set(segs.map((s) => s.type));
        S.rels = S.rels.filter((x) => !(x.from === t && x.to === f && types.has(x.type)));
        segs.forEach((s) => { s.both = true; });
      }
      save(); renderCharForm(); buildGraph(); startSim(0.4); drawGraph();
    };
  });

  const addBtn = box.querySelector('#addRelBtn');
  if (addBtn) addBtn.onclick = () => {
    const to = box.querySelector('#newRelTo').value;
    const type = box.querySelector('#newRelType').value;
    const both = box.querySelector('#newRelBoth').checked;
    if (!to) return;
    if (both) {
      const rev = S.rels.find((x) => x.from === to && x.to === c.id && x.type === type);
      if (rev) rev.both = true;
      else S.rels.push({ from: c.id, to, type, strength: 3, note: '', both: true });
    } else {
      if (S.rels.some((x) => x.from === c.id && x.to === to && x.type === type && !x.both)) return;
      S.rels.push({ from: c.id, to, type, strength: 3, note: '' });
    }
    save(); renderCharForm(); buildGraph(); startSim(0.4); drawGraph();
  };

  box.querySelector('#delCharBtn').onclick = () => {
    if (!confirm('删除「' + (c.name || '该人物') + '」？相关关系也会一并删除。')) return;
    S.chars = S.chars.filter((x) => x.id !== c.id);
    S.rels = S.rels.filter((r) => r.from !== c.id && r.to !== c.id);
    S.ui.selChar = null;
    save(); renderCharList(); renderCharForm(); drawGraph();
  };
}

/* ---------- 关系分段（同一对人物可以有多段性质） ---------- */

function ensureRelIds(list) {
  (list || S.rels).forEach((r, i) => {
    if (!r.id) {
      r.id = 'r' + (Date.now() % 1e6).toString(36) + i.toString(36) + Math.random().toString(36).slice(2, 5);
    }
  });
}

function relGroupKey(r) { return r.from + '>' + r.to; }

/* 按"方向对"归组，段按起始章排序 */
function relGroupsFor(cid) {
  const map = new Map();
  S.rels.filter((r) => r.from === cid || r.to === cid).forEach((r) => {
    ensureRelIds([r]);
    const k = relGroupKey(r);
    if (!map.has(k)) map.set(k, { key: k, from: r.from, to: r.to, segs: [] });
    map.get(k).segs.push(r);
  });
  const out = [...map.values()];
  out.forEach((g) => g.segs.sort((a, b) => (a.fromCh || 1) - (b.fromCh || 1)));
  out.sort((a, b) => {
    const oa = a.from === cid ? 0 : 1;
    const ob = b.from === cid ? 0 : 1;
    return oa - ob;
  });
  return out;
}

/* 在 atCh 处把一段关系切成两段，后段换成 newType */
function splitRelAt(relId, atCh, newType, newStrength) {
  const seg = S.rels.find((r) => r.id === relId);
  if (!seg) return null;
  const ch = Math.max(1, Math.round(+atCh || 1));
  const start = seg.fromCh || 1;
  const oldEnd = seg.toCh || null;

  if (ch <= start) {
    seg.type = newType;
    if (newStrength) seg.strength = newStrength;
    return seg;
  }

  if (oldEnd && ch > oldEnd) {
    /* 这段已经结束，从 ch 起重新长出一段（复合 / 重燃） */
    const nu = {
      from: seg.from, to: seg.to, type: newType,
      strength: newStrength || seg.strength || 3,
      note: '', fromCh: ch, toCh: null,
      ...(seg.both ? { both: true } : {})
    };
    S.rels.push(nu);
    return nu;
  }

  seg.toCh = ch - 1;
  const nu = {
    from: seg.from, to: seg.to, type: newType,
    strength: newStrength || seg.strength || 3,
    note: '', fromCh: ch, toCh: oldEnd,
    ...(seg.both ? { both: true } : {})
  };
  S.rels.push(nu);
  return nu;
}

/* ================= 关系图谱 ================= */

const GW_DEF = 900, GH_DEF = 520;
let GW = GW_DEF, GH = GH_DEF;
let gNodes = [], gLinks = [], gAlpha = 0, gRaf = null, gDrag = null;

/* 让画布逻辑坐标与 CSS 像素 1:1，避免在窄栏里缩成一团 */
function syncGraphSize() {
  const svg = $('graphSvg');
  if (!svg) return false;
  const w = Math.round(svg.clientWidth || GW_DEF);
  const h = Math.round(svg.clientHeight || GH_DEF);
  if (w < 240 || h < 240) return false;
  const changed = Math.abs(w - GW) > 6 || Math.abs(h - GH) > 6;
  GW = w; GH = h;
  svg.setAttribute('viewBox', `0 0 ${GW} ${GH}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return changed;
}

function graphScale() { return clamp(GW / GW_DEF, 0.75, 1.6); }

function relAliveAt(r, ch) {
  const a = r.fromCh || 1;
  const b = r.toCh || Infinity;
  return a <= ch && b >= ch;
}

function buildGraph() {
  syncGraphSize();
  const limit = S.ui.chFilter || 9999;
  const visible = S.chars.filter((c) => (c.firstCh || 1) <= limit);
  const ids = new Set(visible.map((c) => c.id));
  gNodes = visible.map((c) => {
    const old = gNodes.find((n) => n.id === c.id);
    return {
      id: c.id, name: c.name, role: c.role,
      x: old ? old.x : GW / 2 + (Math.random() - 0.5) * Math.min(GW * 0.4, 300),
      y: old ? old.y : GH / 2 + (Math.random() - 0.5) * Math.min(GH * 0.4, 220),
      vx: 0, vy: 0, r: c.role === '主角' ? 26 : c.role === '反派' ? 21 : 17
    };
  });
  /* 同一方向对在同一时刻只画一段：取起始章最新的那段（分段重叠时的兜底） */
  const alive = S.rels.filter((r) => ids.has(r.from) && ids.has(r.to) && relAliveAt(r, limit));
  const best = new Map();
  alive.forEach((r) => {
    const k = r.from + '>' + r.to;
    const cur = best.get(k);
    if (!cur || (r.fromCh || 1) > (cur.fromCh || 1)) best.set(k, r);
  });
  gLinks = [...best.values()].map((r) => ({ ...r }));

  /* 反向对错开：A→B 与 B→A 同时存在时，各自向两侧弯，避免叠成一条线 */
  const dirKey = new Set(gLinks.map((l) => l.from + '>' + l.to));
  gLinks.forEach((l) => {
    const rev = dirKey.has(l.to + '>' + l.from);
    if (l.both || !rev) { l.__off = 0; return; }
    l.__off = l.from < l.to ? 36 : -36;
  });

  gAlpha = 1;

  /* 预热：先跑一轮布局，首帧就是稳定的样子，不用等动画收敛 */
  for (let i = 0; i < 110; i++) forceStep(1.2 - i * 0.008);
  gAlpha = 0.28;
}

function nodeOf(id) { return gNodes.find((n) => n.id === id); }

function forceStep(alpha) {
  const n = gNodes.length;
  const s = graphScale();
  const REP = 9000 * s * s;
  const TARGET = 180 * s;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = gNodes[i], b = gNodes[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
      const d = Math.sqrt(d2);
      const f = (REP / d2) * alpha;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
    }
  }
  gLinks.forEach((l) => {
    const a = nodeOf(l.from), b = nodeOf(l.to);
    if (!a || !b) return;
    let dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const f = (d - TARGET) * 0.018 * (0.6 + (l.strength || 3) * 0.2) * alpha;
    const fx = (dx / d) * f, fy = (dy / d) * f;
    a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
  });
  gNodes.forEach((nd) => {
    if (gDrag && gDrag.id === nd.id) { nd.vx = 0; nd.vy = 0; return; }
    nd.vx += (GW / 2 - nd.x) * 0.011 * alpha;
    nd.vy += (GH / 2 - nd.y) * 0.011 * alpha;
    nd.vx *= 0.82; nd.vy *= 0.82;
    nd.x = clamp(nd.x + nd.vx, 46, GW - 46);
    nd.y = clamp(nd.y + nd.vy, 40, GH - 34);
  });
}

/* --- 边几何：支持曲线（反向对错开）与双向箭头 --- */

function edgeGeom(l) {
  const a = nodeOf(l.from), b = nodeOf(l.to);
  if (!a || !b) return null;
  let dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / dist, uy = dy / dist;
  const padA = a.r + 4, padB = b.r + 9;
  const sx = a.x + ux * padA, sy = a.y + uy * padA;
  const ex = b.x - ux * padB, ey = b.y - uy * padB;
  const off = l.__off || 0;
  const mx = (sx + ex) / 2 - uy * off;
  const my = (sy + ey) / 2 + ux * off;
  const d = off
    ? `M${sx.toFixed(1)},${sy.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`
    : `M${sx.toFixed(1)},${sy.toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)}`;
  return { sx, sy, ex, ey, mx, my, d };
}

function arrowPts(tipX, tipY, fromX, fromY, size) {
  const ang = Math.atan2(tipY - fromY, tipX - fromX);
  const a1 = ang + Math.PI - 0.44, a2 = ang + Math.PI + 0.44;
  return [[tipX, tipY],
    [tipX + Math.cos(a1) * size, tipY + Math.sin(a1) * size],
    [tipX + Math.cos(a2) * size, tipY + Math.sin(a2) * size]]
    .map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
}

function drawGraph() {
  const svg = $('graphSvg');
  if (!svg) return;
  syncGraphSize();
  if (!gNodes.length) {
    svg.innerHTML = `<text x="${GW / 2}" y="${GH / 2}" text-anchor="middle" fill="#8A8984" font-size="13">还没有人物。先在大纲页生成，或在左侧新增。</text>`;
    return;
  }
  const edgeHtml = gLinks.map((l) => {
    const g = edgeGeom(l);
    if (!g) return '';
    const color = REL_COLOR[l.type] || '#888780';
    const w = 1 + (l.strength || 1) * 0.45;
    const head = `<polygon class="earr" data-at="end" fill="${color}" points="${arrowPts(g.ex, g.ey, g.mx, g.my, 8.5)}" opacity=".8"/>`;
    const tail = l.both
      ? `<polygon class="earr" data-at="start" fill="${color}" points="${arrowPts(g.sx, g.sy, g.mx, g.my, 8.5)}" opacity=".8"/>`
      : '';
    const dash = l.toCh ? ` stroke-dasharray="7 5"` : '';
    return `<g class="gedge" data-rid="${l.id}" data-edge="${l.from}|${l.to}">
      <path d="${g.d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" opacity=".42"${dash}/>
      ${tail}${head}
    </g>`;
  }).join('');

  const nodeHtml = gNodes.map((nd) => {
    const c = charById(nd.id);
    const color = ROLE_COLOR[nd.role] || '#888780';
    const sel = S.ui.selChar === nd.id;
    return `<g class="gnode" data-id="${nd.id}" transform="translate(${nd.x},${nd.y})" style="cursor:grab">
      <circle r="${nd.r + (sel ? 4 : 0)}" fill="${color}" opacity="${sel ? '.22' : '0'}"/>
      <circle r="${nd.r}" fill="${color}" stroke="${sel ? '#fff' : 'none'}" stroke-width="2" opacity=".92"/>
      <text y="${nd.r + 15}" text-anchor="middle" font-size="12" fill="currentColor" style="pointer-events:none">${esc(c ? c.name : nd.name)}</text>
      ${sel ? `<text y="${nd.r + 29}" text-anchor="middle" font-size="10" fill="#8A8984" style="pointer-events:none">${esc(nd.role)}</text>` : ''}
    </g>`;
  }).join('');

  svg.innerHTML = edgeHtml + nodeHtml;
  bindGraphEvents();
}

function updateGraphPos() {
  const svg = $('graphSvg');
  if (!svg) return;
  svg.querySelectorAll('g.gnode').forEach((el) => {
    const nd = nodeOf(el.dataset.id);
    if (nd) el.setAttribute('transform', `translate(${nd.x.toFixed(1)},${nd.y.toFixed(1)})`);
  });
  svg.querySelectorAll('g.gedge').forEach((g) => {
    const l = gLinks.find((x) => x.id === g.dataset.rid);
    const geo = l ? edgeGeom(l) : null;
    if (!geo) return;
    const path = g.querySelector('path');
    if (path) path.setAttribute('d', geo.d);
    const e = g.querySelector('[data-at="end"]');
    if (e) e.setAttribute('points', arrowPts(geo.ex, geo.ey, geo.mx, geo.my, 8.5));
    const s = g.querySelector('[data-at="start"]');
    if (s) s.setAttribute('points', arrowPts(geo.sx, geo.sy, geo.mx, geo.my, 8.5));
  });
}

function bindGraphEvents() {
  const svg = $('graphSvg');
  svg.querySelectorAll('.gnode').forEach((el) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const id = el.dataset.id;
      const nd = nodeOf(id);
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) * GW) / r.width;
      const py = ((e.clientY - r.top) * GH) / r.height;
      gDrag = { id, ox: nd.x - px, oy: nd.y - py, moved: false };
      S.ui.selChar = id;
      renderCharList(); renderCharForm(); drawGraph();
      startSim(0.55);
    });
    el.addEventListener('pointerup', (e) => {
      if (gDrag && gDrag.id === el.dataset.id && !gDrag.moved) {
        // 已选中
      }
      gDrag = null;
    });
  });
}

function startSim(alpha) {
  gAlpha = Math.max(gAlpha, alpha || 1);
  if (gRaf) return;
  const loop = () => {
    forceStep(gAlpha);
    updateGraphPos();
    gAlpha *= 0.975;
    if (gAlpha > 0.02) gRaf = requestAnimationFrame(loop);
    else { gRaf = null; }
  };
  gRaf = requestAnimationFrame(loop);
}

function highlightNode(id) {
  const svg = $('graphSvg');
  if (!svg) return;
  svg.querySelectorAll('g.gedge').forEach((g) => {
    const [f, t] = g.dataset.edge.split('|');
    const on = f === id || t === id;
    g.querySelectorAll('path, polygon').forEach((el) => {
      el.setAttribute('opacity', on ? '.95' : '.08');
    });
  });
}

function renderLegend() {
  const arrows = '<span class="lg-note">实线箭头 = 关系方向；两端都有箭头 = 双向；两条弧线 = 互为不同关系；虚线 = 有起止章的关系</span>';
  $('graphLegend').innerHTML = arrows +
    Object.keys(ROLE_COLOR).map((r) =>
      `<span><i style="background:${ROLE_COLOR[r]}"></i>${r}</span>`).join('') +
    Object.keys(REL_COLOR).map((r) =>
      `<span><i style="background:${REL_COLOR[r]};border-radius:1px;height:2px;width:12px"></i>${r}</span>`).join('');
}

/* ================= 取名工具 ================= */

let nameKind = 'person';
const namePref = { person: {}, place: {}, sect: {}, skill: {}, org: {}, title: {} };
const PREF_DEF = {
  person: { style: '随机', gender: '男', len: '2', sur: 'random', ban: '' },
  family: { surname: '', poem: '随机', gens: '4', per: '3', style: '随机' },
  sectline: { sectName: '', poem: '随机' },
  place: { style: '随机' },
  sect: { style: '随机' },
  skill: { style: '随机' },
  org: { style: '随机' },
  title: { style: '随机' }
};

function renderNamePrefs() {
  if (!namePref[nameKind] || !Object.keys(namePref[nameKind]).length) namePref[nameKind] = { ...PREF_DEF[nameKind] };
  const p = namePref[nameKind];
  const box = $('namePrefs');
  let html = '';

  if (nameKind === 'person') {
    html += `<label>气质风格<select data-p="style">
      ${['随机', '冷峻', '儒雅', '锋锐', '温和', '阴鸷', '现代'].map((s) => `<option ${p.style === s ? 'selected' : ''}>${s}</option>`).join('')}
    </select></label>
    <label>性别感<select data-p="gender">
      ${['男', '女', '中'].map((s) => `<option ${p.gender === s ? 'selected' : ''}>${s}</option>`).join('')}
    </select></label>
    <label>名字长度<select data-p="len">
      <option value="1" ${p.len === '1' ? 'selected' : ''}>单字</option>
      <option value="2" ${p.len === '2' ? 'selected' : ''}>双字</option>
      <option value="r" ${p.len === 'r' ? 'selected' : ''}>随机</option>
    </select></label>
    <label>姓氏类型<select data-p="sur">
      <option value="random" ${p.sur === 'random' ? 'selected' : ''}>随机</option>
      <option value="common" ${p.sur === 'common' ? 'selected' : ''}>常见单姓</option>
      <option value="ancient" ${p.sur === 'ancient' ? 'selected' : ''}>古风姓</option>
      <option value="compound" ${p.sur === 'compound' ? 'selected' : ''}>复姓</option>
    </select></label>
    <label>避讳字<input data-p="ban" value="${esc(p.ban)}" placeholder="如：强 伟 芳" maxlength="12"></label>`;
  } else if (nameKind === 'place') {
    html += `<label>地貌风格<select data-p="style">
      ${['随机', '山野', '城镇', '水域', '凶地'].map((s) => `<option ${p.style === s ? 'selected' : ''}>${s}</option>`).join('')}
    </select></label>`;
  } else if (nameKind === 'sect') {
    html += `<label>阵营基调<select data-p="style">
      ${['随机', '正道', '邪道', '中立'].map((s) => `<option ${p.style === s ? 'selected' : ''}>${s}</option>`).join('')}
    </select></label>`;
  } else if (nameKind === 'skill') {
    html += `<label>类型<select data-p="style">
      ${['随机', '功法', '招式', '身法'].map((s) => `<option ${p.style === s ? 'selected' : ''}>${s}</option>`).join('')}
    </select></label>`;
  } else if (nameKind === 'family') {
    html += `<label>姓氏<input data-p="surname" value="${esc(p.surname)}" placeholder="留空随机" maxlength="4"></label>
    <label>字辈诗<select data-p="poem">
      <option value="随机" ${p.poem === '随机' ? 'selected' : ''}>随机</option>
      ${DATA.genPoems.map((x) => `<option value="${x}" ${p.poem === x ? 'selected' : ''}>${x.slice(0, 6)}…</option>`).join('')}
    </select></label>
    <label>世代数<select data-p="gens">
      ${[3, 4, 5, 6].map((n) => `<option ${String(n) === String(p.gens) ? 'selected' : ''}>${n}</option>`).join('')}
    </select></label>
    <label>每代人数<select data-p="per">
      ${[2, 3, 4, 5].map((n) => `<option ${String(n) === String(p.per) ? 'selected' : ''}>${n}</option>`).join('')}
    </select></label>
    <label>名字气质<select data-p="style">
      ${['随机', '冷峻', '儒雅', '锋锐', '温和', '现代'].map((s) => `<option ${p.style === s ? 'selected' : ''}>${s}</option>`).join('')}
    </select></label>`;
  } else if (nameKind === 'sectline') {
    html += `<label>宗门名<input data-p="sectName" value="${esc(p.sectName)}" placeholder="留空随机" maxlength="8"></label>
    <label>字派诗<select data-p="poem">
      <option value="随机" ${p.poem === '随机' ? 'selected' : ''}>随机</option>
      ${DATA.sectPoems.map((x) => `<option value="${x}" ${p.poem === x ? 'selected' : ''}>${x.slice(0, 8)}…</option>`).join('')}
    </select></label>
    <label>层级<span class="hint" style="padding:6px 0">掌门 → 长老 → 真传 → 内门 → 外门</span></label>`;
  } else {
    html += `<label>风格<select data-p="style">
      ${['随机', '硬朗', '古雅', '现代'].map((s) => `<option ${p.style === s ? 'selected' : ''}>${s}</option>`).join('')}
    </select></label>`;
  }

  box.innerHTML = html;
  box.querySelectorAll('[data-p]').forEach((el) => {
    el.oninput = el.onchange = () => { p[el.dataset.p] = el.value; };
  });

  const genBtn = $('genNameBtn');
  if (genBtn) {
    genBtn.textContent = nameKind === 'family' ? '生成一族'
      : nameKind === 'sectline' ? '生成宗门谱系'
      : '生成 24 个';
  }
  const aiBtn = $('aiNameBtn');
  if (aiBtn) {
    aiBtn.textContent = nameKind === 'family' ? 'AI 设计一族'
      : nameKind === 'sectline' ? 'AI 设计宗门'
      : 'AI 取名';
  }
}

function renderNameChips(list, kind) {
  const box = $('nameResults');
  box.className = 'name-grid';
  box.innerHTML = list.map((r, i) =>
    `<div class="name-chip" data-name="${esc(r.text)}" data-kind="${kind}" data-i="${i}">
      ${esc(r.text)}<span class="sub">${esc(r.sub || '')} · 双击收藏</span>
    </div>`).join('');

  box.querySelectorAll('.name-chip').forEach((el) => {
    el.onclick = () => {
      const txt = el.dataset.name;
      if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
      el.classList.add('copied');
      setTimeout(() => el.classList.remove('copied'), 700);
    };
    el.ondblclick = () => {
      const txt = el.dataset.name;
      if (el.dataset.kind === 'person') {
        S.chars.push({
          id: 'c_' + Date.now() + '_' + Math.floor(Math.random() * 999),
          name: txt, alias: '', role: '配角', faction: '', tags: '', motive: '', flaw: '', arc: '', catchphrase: '',
          firstCh: 1, notes: '取名器收藏'
        });
        save(); renderCharList(); buildGraph(); startSim(0.7); drawGraph();
        $('nameInfo').textContent = `「${txt}」已加入人物库`;
      } else {
        if (!S.favNames.includes(txt)) S.favNames.push(txt);
        save(); renderFav(); $('nameInfo').textContent = `「${txt}」已收藏`;
      }
    };
  });
  $('nameInfo').textContent = `已生成 ${list.length} 个`;
}

function generateNames() {
  if (nameKind === 'family') { renderLineage(genFamilyData(namePref.family)); return; }
  if (nameKind === 'sectline') { renderLineage(genSectLineData(namePref.sectline)); return; }

  const prefs = namePref[nameKind] || PREF_DEF[nameKind];
  const seen = new Set();
  const out = [];
  for (let i = 0; i < 300 && out.length < 24; i++) {
    const r = NAME_GEN[nameKind](prefs);
    if (!r || !r.text || seen.has(r.text)) continue;
    seen.add(r.text);
    out.push(r);
  }
  renderNameChips(out, nameKind);
}

/* ---------- 家族 / 宗门谱系 ---------- */

function genFamilyData(p) {
  p = p || PREF_DEF.family;
  const surname = (p.surname || '').trim() || pickSurname('common');
  const poem = (p.poem && p.poem !== '随机') ? p.poem : rnd(DATA.genPoems);
  const gens = clamp(+p.gens || 4, 3, 6);
  const per = clamp(+p.per || 3, 2, 5);
  const groups = [];

  for (let g = 0; g < Math.min(gens, poem.length); g++) {
    const gc = poem[g];
    const seen = new Set();
    const members = [];
    let guard = 0;
    while (members.length < per && guard++ < 120) {
      const given = pickGiven({ style: p.style || '随机', gender: '男', len: '1' });
      const full = surname + gc + given;
      if (seen.has(full)) continue;
      seen.add(full);
      members.push(full);
    }
    groups.push({ label: `第${cn(g + 1)}代 · ${gc}字辈`, members });
  }

  return {
    title: surname + '家',
    subtitle: '字辈：' + poem.slice(0, gens).split('').join(' · '),
    groups,
    faction: surname + '家',
    kind: 'family'
  };
}

function genSectLineData(p) {
  p = p || PREF_DEF.sectline;
  const name = (p.sectName || '').trim() || (rnd(DATA.sect.pre) + rnd(['宗', '门', '阁', '殿', '观', '教']));
  const poem = (p.poem && p.poem !== '随机') ? p.poem : rnd(DATA.sectPoems);
  const groups = [];
  const usedDao = new Set();
  let gi = 0;

  DATA.sectRanks.forEach((rank) => {
    if (gi >= poem.length) return;
    const gc = poem[gi];
    const seen = new Set();
    const members = [];
    let guard = 0;
    while (members.length < rank.count && guard++ < 200) {
      const tail = rnd(DATA.daoChars.split(''));
      const dao = gc + tail;
      if (seen.has(dao) || usedDao.has(tail)) continue;
      seen.add(dao);
      usedDao.add(tail);
      members.push(dao);
    }
    groups.push({ label: `${rank.title} · ${gc}字辈`, members });
    gi++;
  });

  return {
    title: name,
    subtitle: '字派：' + poem.split('').join(' · '),
    groups,
    faction: name,
    kind: 'sect'
  };
}

function renderLineage(payload) {
  const box = $('nameResults');
  window.__lineage = payload;
  box.className = 'lineage-wrap';
  box.innerHTML = `
    <div class="lineage">
      <div class="lineage-head">
        <div>
          <div class="lineage-name">${esc(payload.title)}</div>
          <div class="lineage-sub">${esc(payload.subtitle)}</div>
        </div>
        <button class="btn small primary" id="lineageAddBtn" type="button">全部加入人物库</button>
      </div>
      <div class="lineage-groups">
        ${payload.groups.map((g) => `
          <div class="lineage-group">
            <div class="lg-label">${esc(g.label)}</div>
            <div class="lg-members">
              ${g.members.map((m) => `<span class="name-chip mini" data-name="${esc(m)}">${esc(m)}</span>`).join('')}
            </div>
          </div>`).join('')}
      </div>
    </div>`;

  box.querySelectorAll('.name-chip').forEach((el) => {
    el.onclick = () => {
      if (navigator.clipboard) navigator.clipboard.writeText(el.dataset.name).catch(() => {});
      el.classList.add('copied');
      setTimeout(() => el.classList.remove('copied'), 700);
    };
  });

  const addBtn = box.querySelector('#lineageAddBtn');
  if (addBtn) addBtn.onclick = () => addLineageToChars(payload);

  const total = payload.groups.reduce((a, g) => a + g.members.length, 0);
  $('nameInfo').textContent = `已生成 ${total} 人`;
}

function addLineageToChars(p) {
  const base = 'c_l' + Date.now().toString(36);
  const ids = [];

  p.groups.forEach((g, gi) => {
    g.members.forEach((m, mi) => {
      const id = `${base}_${gi}_${mi}`;
      S.chars.push({
        id, name: m, alias: '', role: '配角', faction: p.faction,
        tags: g.label, motive: '', flaw: '', arc: '', catchphrase: '',
        firstCh: 1, notes: '取名器批量生成'
      });
      ids.push({ id, gi, mi });
    });
  });

  const byGen = {};
  ids.forEach((x) => { (byGen[x.gi] = byGen[x.gi] || []).push(x.id); });
  const root = byGen[0] && byGen[0][0];

  if (p.kind === 'family') {
    Object.keys(byGen).forEach((gi) => {
      const arr = byGen[gi];
      if (root && arr[0] !== root) S.rels.push({ from: root, to: arr[0], type: '亲属', strength: 4, note: '长辈—晚辈' });
      for (let i = 1; i < arr.length; i++) S.rels.push({ from: arr[0], to: arr[i], type: '亲属', strength: 3, note: '同辈', both: true });
    });
  } else if (root) {
    Object.keys(byGen).forEach((gi) => {
      if (gi === '0') return;
      const arr = byGen[gi];
      if (arr && arr[0]) S.rels.push({ from: root, to: arr[0], type: '师徒', strength: 4, note: '掌门—门下' });
    });
  }

  /* 去重：同向同类型合并；反向同类型合成双向 */
  const seen = new Set();
  S.rels = S.rels.filter((r) => {
    const k = [r.from, r.to, r.type].join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    const rev = S.rels.find((x) => x.from === r.to && x.to === r.from && x.type === r.type);
    if (rev && rev !== r && !r.both) r.both = true;
    return true;
  });

  save();
  renderCharList(); renderSideStats();
  buildGraph(); startSim(0.3); drawGraph();
  $('nameInfo').textContent = `已加入 ${ids.length} 人，关系已自动连好`;
}

/* ---------- AI 取名 ---------- */

const NAME_KIND_LABEL = {
  person: '人名', place: '地名', sect: '宗门名', skill: '功法招式',
  org: '组织公司', title: '书名', family: '家族谱系', sectline: '宗门谱系'
};

const SUR_LABEL = { random: '不限', common: '常见单姓', ancient: '古风姓', compound: '复姓' };

function namePrefLines() {
  const p = namePref[nameKind] || {};
  const L = [];
  if (nameKind === 'person') {
    L.push(`气质风格：${p.style || '随机'}`);
    L.push(`性别感：${p.gender || '男'}`);
    L.push(`名字长度：${p.len === '2' ? '双字' : p.len === '1' ? '单字' : '单双均可'}`);
    L.push(`姓氏类型：${SUR_LABEL[p.sur || 'random']}`);
    if ((p.ban || '').trim()) L.push(`避讳字（绝对不能用）：${p.ban.trim()}`);
  } else if (nameKind === 'family') {
    L.push(`姓氏：${(p.surname || '').trim() || '你来定'}`);
    L.push(`名字气质：${p.style || '随机'}`);
    L.push(`世代数：${p.gens || 4}，每代人数：${p.per || 3}`);
    if (p.poem && p.poem !== '随机') L.push(`字辈诗必须用这一首：${p.poem}`);
  } else if (nameKind === 'sectline') {
    L.push(`宗门名：${(p.sectName || '').trim() || '你来定'}`);
    if (p.poem && p.poem !== '随机') L.push(`字派必须用这一句：${p.poem}`);
  } else {
    L.push(`风格倾向：${p.style || '随机'}`);
  }
  L.push(`故事题材：${S.project.genre || '都市脑洞'}`);
  if (S.project.title) L.push(`作品名：《${S.project.title}》`);
  return L;
}

function nameAvoidList() {
  const names = S.chars.map((c) => c.name).filter(Boolean).slice(0, 14);
  return names.join('、');
}

async function aiNames() {
  if (!(await ensureAI())) return;

  const lineage = nameKind === 'family' || nameKind === 'sectline';
  const p = namePref[nameKind] || {};
  const ctx = {
    kind: nameKind,
    kindLabel: NAME_KIND_LABEL[nameKind] || nameKind,
    genre: S.project.genre || '都市脑洞',
    count: 24,
    lines: namePrefLines().map((x) => '- ' + x).join('\n'),
    avoid: nameAvoidList(),
    surname: (p.surname || '').trim(),
    style: p.style || '随机',
    gens: clamp(+p.gens || 4, 3, 6),
    per: clamp(+p.per || 3, 2, 5),
    sectName: (p.sectName || '').trim()
  };

  $('aiNameBtn').classList.add('busy');
  try {
    await runAiJob({
      title: lineage ? 'AI 正在设计谱系' : 'AI 正在取名',
      expectChars: lineage ? 1200 : 1800,
      steps: ['连接本地服务', '提交请求', '接收模型输出', '解析名字 JSON',
        lineage ? '绘制谱系' : '写入名字池'],
      messages: () => [
        { role: 'system', content: PROMPTS.namesSystem },
        { role: 'user', content: lineage ? PROMPTS.lineageUser(ctx) : PROMPTS.namesUser(ctx) }
      ],
      params: { json: true, temperature: 0.95, maxTokens: 2600 },
      parse: (text) => parseJsonLoose(text),
      apply: (data) => {
        if (lineage) {
          const groups = (Array.isArray(data.groups) ? data.groups : [])
            .filter((g) => g && Array.isArray(g.members))
            .map((g) => ({
              label: String(g.label || '').trim() || '未命名',
              members: g.members.map((m) => String(m).trim()).filter(Boolean).slice(0, 8)
            }))
            .filter((g) => g.members.length);
          if (!groups.length) throw aiError('模型没有返回谱系数据，换个模型再试', { kind: 'empty' });
          renderLineage({
            title: String(data.title || (nameKind === 'family' ? '未命名家族' : '未命名宗门')).trim(),
            subtitle: String(data.subtitle || '').trim(),
            groups,
            faction: String(data.title || '').trim(),
            kind: nameKind === 'family' ? 'family' : 'sect'
          });
        } else {
          const list = (Array.isArray(data.names) ? data.names : [])
            .map((n) => ({ text: String((n && n.text) || '').trim(), sub: String((n && n.sub) || '').trim() }))
            .filter((n) => n.text);
          if (!list.length) throw aiError('模型没有返回名字，换个模型再试', { kind: 'empty' });
          renderNameChips(list.slice(0, 40), nameKind);
        }
      },
      doneText: '已生成，点名字即可取用',
      closeAfter: 700
    });
  } finally {
    $('aiNameBtn').classList.remove('busy');
  }
}

function renderFav() {
  $('favList').innerHTML = S.favNames.length
    ? S.favNames.map((n) => `<span class="fav-item"><b>${esc(n)}</b><button data-fav="${esc(n)}">×</button></span>`).join('')
    : '<span class="hint">还没有收藏。双击生成结果即可加入。</span>';
  $('favList').querySelectorAll('[data-fav]').forEach((b) => {
    b.onclick = () => { S.favNames = S.favNames.filter((x) => x !== b.dataset.fav); save(); renderFav(); };
  });
}

/* ================= 码字台 ================= */

function renderTree() {
  const box = $('chapterTree');
  if (!S.chapters.length) { box.innerHTML = '<p class="hint" style="padding:8px">还没有章纲</p>'; return; }
  let html = '';
  S.volumes.forEach((v) => {
    html += `<div class="tree-vol">${esc(v.name)}</div>`;
    S.chapters.filter((c) => c.volId === v.id).forEach((c) => {
      const txt = S.texts[c.no] || '';
      const done = txt.replace(/\s/g, '').length > 200;
      html += `<div class="tree-ch${S.ui.selChapter === c.no ? ' sel' : ''}${done ? ' done' : ''}" data-ch="${c.no}">${c.no}. ${esc(c.title)}</div>`;
    });
  });
  box.innerHTML = html;
  box.querySelectorAll('.tree-ch').forEach((el) => {
    el.onclick = () => { S.ui.selChapter = +el.dataset.ch; renderTree(); loadChapterToEditor(+el.dataset.ch); };
  });
}

function loadChapterToEditor(no) {
  const c = S.chapters.find((x) => x.no === no);
  if (!c) return;
  $('editorTitle').textContent = `第 ${c.no} 章 · ${c.title}`;
  $('editor').value = S.texts[no] || '';
  updateWordCount();
  renderContext(c);
  renderTree();
  save();
}

function updateWordCount() {
  const n = ($('editor').value || '').replace(/\s/g, '').length;
  $('wordCount').textContent = `${n} 字`;
}

function renderContext(c) {
  const pool = S.chars.filter((x) => (x.firstCh || 1) <= c.no).slice(0, 5);
  const fs = S.fs.filter((f) => f.plantCh <= c.no && (!f.done || f.payCh === c.no));
  $('chapterContext').innerHTML = `
    <div class="ctx-block"><div class="k">本章目标</div><div class="v">${esc(c.goal)}</div></div>
    <div class="ctx-block"><div class="k">阻碍</div><div class="v">${esc(c.obstacle)}</div></div>
    <div class="ctx-block"><div class="k">转折</div><div class="v">${esc(c.turn)}</div></div>
    <div class="ctx-block"><div class="k">爽点（${esc(BEAT_LABEL[c.func] || c.func)}）</div><div class="v">${esc(c.payoff)}</div></div>
    <div class="ctx-block"><div class="k">章末钩子</div><div class="v">${esc(c.hook)}</div></div>
    <div class="ctx-block"><div class="k">可能出场的人</div>
      ${pool.map((p) => `<span class="ctx-char"><span style="width:6px;height:6px;border-radius:50%;background:${ROLE_COLOR[p.role] || '#888780'}"></span>${esc(p.name)}</span>`).join('') || '<span class="hint">无</span>'}
    </div>
    <div class="ctx-block"><div class="k">本章该结算的伏笔</div>
      ${fs.map((f) => `<div>· ${esc(f.title)}（埋于第 ${f.plantCh} 章，计划第 ${f.payCh} 章回收）</div>`).join('') || '<span class="hint">无</span>'}
    </div>
    <div class="ctx-block"><div class="k">上一章</div><div class="v hint">${esc(S.chapters.find((x) => x.no === c.no - 1) ? S.chapters.find((x) => x.no === c.no - 1).hook : '这是第一章')}</div></div>`;
}

/* ================= 伏笔 ================= */

function addForeshadow() {
  const title = $('fsTitle').value.trim();
  const plant = Math.max(1, Math.round(+$('fsPlant').value || 1));
  const pay = Math.max(1, Math.round(+$('fsPay').value || plant + 30));
  if (!title) { alert('先写伏笔内容'); return; }
  if (pay < plant) { alert('回收章不能早于埋设章（第 ' + plant + ' 章埋的伏笔，不可能在第 ' + pay + ' 章回收）。'); return; }
  S.fs.push({ id: 'f_' + Date.now(), title, plantCh: plant, payCh: pay, done: false });
  $('fsTitle').value = ''; $('fsPlant').value = ''; $('fsPay').value = '';
  save(); renderFs();
}

function renderFs() {
  const cur = S.chapters.filter((c) => (S.texts[c.no] || '').replace(/\s/g, '').length > 50).length
    ? Math.max(...S.chapters.filter((c) => (S.texts[c.no] || '').replace(/\s/g, '').length > 50).map((c) => c.no))
    : 0;

  const list = S.fs.slice().sort((a, b) => a.payCh - b.payCh);
  $('fsList').innerHTML = list.map((f) => {
    const overdue = !f.done && f.payCh <= cur;
    return `<div class="fs-row${overdue ? ' overdue' : ''}">
      <div>${esc(f.title)}</div>
      <div class="fs-num">埋 ${f.plantCh}</div>
      <div class="fs-num">收 ${f.payCh}</div>
      <div><button class="btn small" data-toggle="${f.id}" style="padding:2px 8px;font-size:11px">${f.done ? '已回收' : overdue ? '已逾期' : '待回收'}</button></div>
      <button data-del="${f.id}">×</button>
    </div>`;
  }).join('') || '<p class="hint">还没有记录。伏笔不记账，最后一定忘。</p>';

  const open = S.fs.filter((f) => !f.done).length;
  $('fsStat').textContent = `未回收 ${open} / 共 ${S.fs.length}${cur ? ' · 当前写到第 ' + cur + ' 章' : ''}`;

  $('fsList').querySelectorAll('[data-toggle]').forEach((b) => {
    b.onclick = () => { const f = S.fs.find((x) => x.id === b.dataset.toggle); f.done = !f.done; save(); renderFs(); };
  });
  $('fsList').querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => { S.fs = S.fs.filter((x) => x.id !== b.dataset.del); save(); renderFs(); };
  });
}

/* ================= 全局渲染与事件 ================= */

function renderSideStats() {
  const words = Object.values(S.texts).reduce((a, t) => a + (t || '').replace(/\s/g, '').length, 0);
  const mutual = S.rels.filter((r) => r.both).length;
  const alive = S.rels.filter((r) => relAliveAt(r, S.ui.chFilter || 9999)).length;
  $('sideStats').innerHTML = `
    章纲 <b>${S.chapters.length}</b> 章<br>
    已成稿 <b>${(words / 10000).toFixed(1)}</b> 万字<br>
    人物 <b>${S.chars.length}</b> · 关系 <b>${S.rels.length}</b>${mutual ? ` · 双向 <b>${mutual}</b>` : ''}<br>
    当前章有效关系 <b>${alive}</b> 条<br>
    伏笔未收 <b>${S.fs.filter((f) => !f.done).length}</b>`;
}

function renderAll() {
  renderCore(); renderVolumes(); renderChapters(); renderBeatMap();
  renderCharList(); renderCharForm(); renderLegend();
  buildGraph(); startSim(0.3); drawGraph();
  renderTree(); renderFs(); renderFav(); renderSideStats();
  if (S.chapters.length) {
    $('outlineResult').classList.remove('hidden');
    $('genInfo').textContent = `共 ${S.chapters.length} 章 / ${S.volumes.length} 卷`;
    const maxCh = S.chapters.length;
    $('chFilter').max = maxCh;
    S.ui.chFilter = Math.min(S.ui.chFilter || maxCh, maxCh);
    $('chFilter').value = S.ui.chFilter;
    $('chFilterVal').textContent = S.ui.chFilter;
  }
}

function switchView(name) {
  S.ui.view = name;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'chars') {
    buildGraph(); startSim(0.3); drawGraph();
    renderCharForm(); renderSideStats();
  }
  if (name === 'write') {
    renderTree();
    if (S.ui.selChapter && S.chapters.some((c) => c.no === S.ui.selChapter)) loadChapterToEditor(S.ui.selChapter);
  }
  if (name === 'analyze' && typeof renderAnalysis === 'function') {
    renderAnalysis(S.analysis);
    renderAiAnalysis(S.analysis && S.analysis.ai);
  }
  if (name === 'rank' && typeof renderRank === 'function') renderRank();
  save();
}

function applyTheme() {
  document.body.classList.toggle('dark', S.theme === 'dark');
  $('themeBtn').textContent = S.theme === 'dark' ? '浅色' : '暗色';
}

function exportProject() {
  const L = [];
  L.push(`# ${S.project.title || '未命名作品'}`);
  L.push(`\n题材：${S.project.genre}　预计 ${S.project.totalWan} 万字　共 ${S.chapters.length} 章\n`);
  if (S.core) {
    L.push('## 核心设定');
    L.push(`- 一句话：${S.core.oneLine}`);
    L.push(`- 金手指：${S.core.gold}`);
    L.push(`- 核心冲突：${S.core.conflict}`);
    L.push(`- 结局：${S.core.ending}\n`);
  }
  if (S.volumes.length) {
    L.push('## 卷纲');
    S.volumes.forEach((v) => {
      L.push(`\n### ${v.name}（第 ${v.fromCh}–${v.toCh} 章）`);
      L.push(`- 目标：${v.goal}`);
      L.push(`- 对手：${v.enemy}｜地图：${v.map}`);
      L.push(`- 弧光：${v.arc}`);
      L.push(`- 卷末：${v.climax}`);
    });
  }
  if (S.chapters.length) {
    L.push('\n## 章纲');
    S.chapters.forEach((c) => {
      L.push(`\n第 ${c.no} 章 ${c.title}（${BEAT_LABEL[c.func] || c.func}）`);
      L.push(`目标：${c.goal}\n阻碍：${c.obstacle}\n转折：${c.turn}\n爽点：${c.payoff}\n钩子：${c.hook}`);
    });
  }
  if (S.chars.length) {
    L.push('\n## 人物');
    S.chars.forEach((c) => {
      L.push(`\n### ${c.name}（${c.role}）`);
      L.push(`标签：${c.tags}\n动机：${c.motive}\n缺陷：${c.flaw}\n弧光：${c.arc}\n口头禅：${c.catchphrase}`);
    });
  }
  if (S.rels.length) {
    L.push('\n## 关系');
    S.rels.forEach((r) => {
      const a = charById(r.from), b = charById(r.to);
      L.push(`- ${a ? a.name : r.from} →[${r.type}] ${b ? b.name : r.to}`);
    });
  }
  if (S.fs.length) {
    L.push('\n## 伏笔');
    S.fs.forEach((f) => L.push(`- ${f.title}（埋 ${f.plantCh} / 收 ${f.payCh}）${f.done ? ' ✓' : ''}`));
  }
  const withText = Object.keys(S.texts).filter((k) => (S.texts[k] || '').trim());
  if (withText.length) {
    L.push('\n## 正文');
    withText.sort((a, b) => a - b).forEach((no) => {
      const c = S.chapters.find((x) => x.no === +no);
      L.push(`\n### 第 ${no} 章 ${c ? c.title : ''}\n${S.texts[no]}`);
    });
  }

  const blob = new Blob([L.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (S.project.title || '小说项目') + '.md';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

/* ================= 备份 / 导入 =================
   数据只在浏览器 localStorage 里。Markdown 导出是给人读的，导不回来；
   这里的 JSON 备份是完整状态，可以原样导入，换浏览器 / 清缓存前先点一下。 */

const BACKUP_MAGIC = 'yantai-novel-backup';

function backupFileName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  const safe = (S.project.title || '小说项目').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  return `${safe}-备份-${stamp}.json`;
}

function exportBackup() {
  const payload = { magic: BACKUP_MAGIC, version: 1, savedAt: new Date().toISOString(), state: S };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = backupFileName();
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

function importBackupFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => alert('读取文件失败');
  reader.onload = () => {
    let o;
    try { o = JSON.parse(String(reader.result)); } catch (e) { alert('这不是有效的备份文件（JSON 解析失败）'); return; }
    if (!o || o.magic !== BACKUP_MAGIC || !o.state || typeof o.state !== 'object') {
      alert('这不是砚台的备份文件。');
      return;
    }
    const words = Object.values(o.state.texts || {}).reduce((a, t) => a + String(t || '').replace(/\s/g, '').length, 0);
    const cur = Object.values(S.texts).reduce((a, t) => a + String(t || '').replace(/\s/g, '').length, 0);
    const msg = `导入备份《${(o.state.project && o.state.project.title) || '未命名'}》\n` +
      `· 备份里：${(o.state.chapters || []).length} 章纲，正文 ${words} 字\n` +
      `· 当前项目：${S.chapters.length} 章纲，正文 ${cur} 字\n\n` +
      '导入会【覆盖】当前项目。继续？（建议先点「备份」保存当前内容）';
    if (!confirm(msg)) return;
    S = normalizeState(o.state);
    ensureRelIds();
    S.rels.forEach((r) => { if (r.fromCh == null) r.fromCh = 1; });
    writeNow();
    location.reload();
  };
  reader.readAsText(file);
}

/* 重新生成大纲会重排章号，而正文是按章号存的 */
function confirmOverwriteText() {
  const words = Object.values(S.texts).reduce((a, t) => a + String(t || '').replace(/\s/g, '').length, 0);
  if (!words) return true;
  return confirm(`当前已写了约 ${words} 字正文。\n\n重新生成大纲后，章号可能与现有正文错位（正文不会被删，但会挂在新的同号章节下）。\n建议先点右上角「备份」。\n\n仍要重新生成？`);
}

/* ================= AI 接入 ================= */

const AI_PREF = 'yantai.ai';
const AI_MODELS = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  openrouter: ['deepseek/deepseek-chat', 'anthropic/claude-sonnet-4', 'openai/gpt-4o', 'google/gemini-2.5-pro', 'qwen/qwen3-235b-a22b']
};

function loadAiPref() {
  try {
    const o = JSON.parse(localStorage.getItem(AI_PREF) || '{}');
    if (o.provider) AI.provider = o.provider;
    if (o.model) AI.model = o.model;
  } catch (e) {}
}
function saveAiPref() {
  try { localStorage.setItem(AI_PREF, JSON.stringify({ provider: AI.provider, model: AI.model })); } catch (e) {}
}

function autoPickProvider() {
  if (AI.hasKey(AI.provider)) return;
  const alt = Object.keys(AI.status).find((p) => AI.status[p] && AI_MODELS[p]);
  if (!alt) return;
  AI.provider = alt;
  if (!AI_MODELS[alt].includes(AI.model)) AI.model = AI_MODELS[alt][0];
  saveAiPref();
}

function updateAiBadge() {
  const b = $('aiSettingsBtn');
  if (!b) return;
  if (!AI.online) { b.textContent = 'AI 未连接'; b.title = '本地服务未启动'; return; }
  b.textContent = AI.hasKey() ? 'AI 就绪' : 'AI 设置';
  b.title = AI.provider + ' / ' + AI.model;
}

function renderAiStatus() {
  const el = $('aiStatus');
  if (!el) return;
  const d = AI.status.deepseek, o = AI.status.openrouter;
  el.innerHTML = AI.online
    ? `本地服务 <span class="on">已连接</span>　DeepSeek <span class="${d ? 'on' : 'off'}">${d ? '已配置' : '未配置'}</span>　OpenRouter <span class="${o ? 'on' : 'off'}">${o ? '已配置' : '未配置'}</span>`
    : `本地服务 <span class="off">未连接</span>　<span style="color:var(--text3)">请运行 node server.js，访问 http://127.0.0.1:8931</span>`;
}

function renderModelList() {
  const p = $('aiProvider').value;
  const list = AI_MODELS[p] || [];
  $('aiModelList').innerHTML = list.map((m) => `<option value="${m}"></option>`).join('');
  if (list.indexOf($('aiModel').value) < 0) $('aiModel').value = list[0] || '';
}

function openAiModal() {
  $('aiProvider').value = AI.provider;
  renderModelList();
  $('aiModel').value = AI.model || (AI_MODELS[AI.provider] || [''])[0];
  $('aiKey').value = '';
  $('aiMsg').textContent = '';
  renderAiStatus();
  $('aiModal').classList.remove('hidden');
}

function closeModal(id) {
  const el = $(id);
  if (el) el.classList.add('hidden');
}

/* ================= AI 任务进度 ================= */

const Job = {
  t0: 0,
  tickTimer: null,
  expectChars: 1200,
  chars: 0,
  lastDataAt: 0,
  stage: '',
  activeStep: -1,
  stepNames: [],
  retryFn: null,
  finished: false,

  start(title, opts) {
    opts = opts || {};
    this.t0 = Date.now();
    this.expectChars = Math.max(200, opts.expectChars || 1200);
    this.chars = 0;
    this.lastDataAt = Date.now();
    this.finished = false;
    this.retryFn = opts.retry || null;
    this.closeAfter = opts.closeAfter || 0;
    this.stepNames = opts.steps || ['连接本地服务', '提交请求', '接收模型输出', '解析结果', '写入项目'];

    $('jobTitle').textContent = title;
    $('jobDock').classList.remove('hidden');
    this.expand();
    $('jobDot').className = 'jd-dot';
    $('jobLog').textContent = '';
    $('jobStats').textContent = '';
    $('jobInfo').textContent = '';
    $('jobPct').textContent = '0%';
    $('jobError').classList.add('hidden');
    $('jobError').innerHTML = '';
    $('jobResult').classList.add('hidden');
    $('jobResult').innerHTML = '';
    $('jobApply').classList.add('hidden');
    $('jobRetry').classList.add('hidden');
    $('jobRetry').onclick = null;
    $('jobDetailWrap').open = false;
    $('jobDetailWrap').classList.remove('hidden');
    $('jobBar').style.width = '0%';
    $('jobBar').classList.remove('done', 'err', 'indet');
    $('jobCancel').classList.remove('hidden');
    $('jobCancel').disabled = false;
    $('jobCancel').textContent = '中断';

    this.renderSteps(-1);
    this.setPct(3, '准备中');
    this.startTick();
  },

  /* 收起 / 展开 / 关闭（收起后任务继续跑，只是不占地方） */
  expand() {
    $('jobDock').classList.remove('collapsed');
    $('jobMin').textContent = '–';
    $('jobMin').title = '收起';
  },

  collapse() {
    $('jobDock').classList.add('collapsed');
    $('jobMin').textContent = '▴';
    $('jobMin').title = '展开';
  },

  toggle() {
    $('jobDock').classList.contains('collapsed') ? this.expand() : this.collapse();
  },

  hide() {
    $('jobDock').classList.add('hidden');
  },

  renderSteps(active, sub) {
    this.activeStep = active;
    $('jobSteps').innerHTML = this.stepNames.map((n, i) => {
      const state = i < active ? 'done' : i === active ? 'run' : 'wait';
      return `<li class="jstep ${state}">
        <span class="dot"></span>
        <span class="lbl">${esc(n)}</span>
        ${i === active && sub ? `<span class="sub">${esc(sub)}</span>` : ''}
      </li>`;
    }).join('');
  },

  step(idx, label) {
    this.renderSteps(idx, label || '');
    const base = [4, 12, 20, 88, 96][idx] || 3;
    this.setPct(Math.max(this.pctValue || 0, base), label || this.stepNames[idx] || '');
  },

  setPct(v, stage) {
    const pct = Math.max(0, Math.min(100, Math.round(v)));
    this.pctValue = pct;
    $('jobBar').style.width = pct + '%';
    $('jobPct').textContent = pct + '%';
    if (stage) { this.stage = stage; $('jobStage').textContent = stage; }
  },

  /* 流式增量：接收阶段按"已收字符 / 预期字符"推进到 85% */
  data(full) {
    this.chars = (full || '').length;
    this.lastDataAt = Date.now();
    if (this.activeStep < 2) this.step(2, '接收中');
    const r = Math.min(1, this.chars / this.expectChars);
    this.setPct(20 + r * 65, `接收中 · 已收 ${this.chars.toLocaleString()} 字`);
    this.markStepSub(`已收 ${this.chars.toLocaleString()} 字`);
  },

  markStepSub(sub) {
    const el = $('jobSteps').querySelector('.jstep.run .sub');
    if (el) el.textContent = sub;
    else {
      const run = $('jobSteps').querySelector('.jstep.run');
      if (run && sub) run.insertAdjacentHTML('beforeend', `<span class="sub">${esc(sub)}</span>`);
    }
  },

  log(t) {
    $('jobLog').textContent = t;
  },

  info(t) { $('jobInfo').textContent = t; },

  /* 纯文本结果（体检这类不落库的输出）直接摊开给人看 */
  result(text) {
    const el = $('jobResult');
    if (!text) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = `<div class="jr-head">结果</div><div class="jr-body">${esc(text).replace(/\n/g, '<br>')}</div>`;
  },

  startTick() {
    clearInterval(this.tickTimer);
    this.tickTimer = setInterval(() => {
      if (this.finished) return;
      const sec = ((Date.now() - this.t0) / 1000).toFixed(1);
      const idle = Math.round((Date.now() - this.lastDataAt) / 1000);
      if (this.chars > 0) {
        $('jobStage').textContent = `接收中 · 已收 ${this.chars.toLocaleString()} 字 · ${sec}s`;
        /* 卡住 6 秒以上给个提示 */
        if (idle >= 6) $('jobStage').textContent += `（${idle}s 无新数据）`;
      } else if (this.activeStep >= 2) {
        $('jobStage').textContent = `等待首个字 · ${sec}s`;
        if (idle >= 8) $('jobStage').textContent += '（上游还没吐字，可能在思考）';
      }
      $('jobStats').innerHTML = this.statsHtml(sec);
    }, 250);
  },

  statsHtml(sec) {
    const r = AI.lastRun || {};
    const bits = [];
    bits.push(`模型 <b>${esc(r.model || AI.model)}</b>`);
    bits.push(`用时 <b>${sec || '0.0'}s</b>`);
    if (r.ttfb) bits.push(`首字 <b>${(r.ttfb / 1000).toFixed(1)}s</b>`);
    if (r.chunks) bits.push(`片段 <b>${r.chunks}</b>`);
    if (r.chars) bits.push(`正文 <b>${r.chars.toLocaleString()}</b> 字`);
    if (r.reasonChars) bits.push(`思考 <b>${r.reasonChars.toLocaleString()}</b> 字`);
    if (r.finish) bits.push(`finish <b>${esc(r.finish)}</b>`);
    if (r.usage && r.usage.total_tokens) {
      bits.push(`tokens <b>${r.usage.prompt_tokens || 0}+${r.usage.completion_tokens || 0}</b>`);
    }
    if (r.requestId) bits.push(`req <b>${esc(String(r.requestId).slice(0, 14))}</b>`);
    return bits.join('　·　');
  },

  done(msg) {
    this.finished = true;
    clearInterval(this.tickTimer);
    this.setPct(100, msg || '完成');
    $('jobBar').classList.add('done');
    $('jobDot').className = 'jd-dot done';
    $('jobSteps').querySelectorAll('.jstep').forEach((el) => {
      el.classList.remove('run', 'wait');
      el.classList.add('done');
    });
    $('jobStats').innerHTML = this.statsHtml(((Date.now() - this.t0) / 1000).toFixed(1));
    $('jobCancel').classList.add('hidden');

    /* 成功后先收成小条，5 秒后自动消失；想看统计随时展开 */
    if (this.closeAfter) {
      setTimeout(() => {
        this.collapse();
        setTimeout(() => { if (this.finished) this.hide(); }, 5000);
      }, this.closeAfter);
    }
  },

  fail(err, retryFn) {
    this.finished = true;
    clearInterval(this.tickTimer);
    const info = AI.explain ? AI.explain(err) : { title: '调用失败', reason: err.message, tips: [] };
    const r = AI.lastRun || {};

    $('jobBar').classList.add('err');
    $('jobDot').className = 'jd-dot err';
    this.expand();
    this.setPct(this.pctValue || 100, '失败');
    $('jobPct').textContent = '失败';
    $('jobSteps').querySelectorAll('.jstep.run').forEach((el) => {
      el.classList.remove('run');
      el.classList.add('err');
    });

    const tech = {
      模式: r.mode, 服务商: r.provider, 模型: r.model,
      收到片段: r.chunks, 正文字数: r.chars, 思考字数: r.reasonChars,
      流行数: r.rawLines, 收到结束标记: r.sawDone, finish_reason: r.finish || '(未给出)',
      首字延迟ms: r.ttfb, 总耗时ms: r.ms, usage: r.usage, requestId: r.requestId,
      上游片段: r.sample ? String(r.sample).slice(0, 500) : '(空)',
      原始错误: err.message, diag: err.diag || null
    };
    const techText = JSON.stringify(tech, null, 2);

    $('jobError').classList.remove('hidden');
    $('jobError').innerHTML = `
      <div class="je-head">✕ ${esc(info.title)}</div>
      <div class="je-reason">${esc(info.reason)}</div>
      ${(info.tips || []).length ? `<ul class="je-tips">${info.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${info.body ? `<details class="je-more"><summary>上游原始响应</summary><pre>${esc(String(info.body).slice(0, 1500))}</pre></details>` : ''}
      <details class="je-more"><summary>技术细节</summary><pre>${esc(techText)}</pre></details>`;

    $('jobInfo').textContent = '可以把「技术细节」复制给我，我来判断原因';
    $('jobStats').innerHTML = this.statsHtml(((Date.now() - this.t0) / 1000).toFixed(1));
    $('jobCancel').classList.add('hidden');

    if (retryFn || this.retryFn) {
      const fn = retryFn || this.retryFn;
      $('jobRetry').classList.remove('hidden');
      $('jobRetry').onclick = () => { $('jobRetry').classList.add('hidden'); fn(); };
    }
  }
};

/* 兼容旧调用 */
function showJob(title) { Job.start(title, { expectChars: 2000 }); }
function setJobLog(t) { Job.log(t); }
function setJobInfo(t) { Job.info(t); }

/* 统一跑一次 AI 任务：进度条 + 明细 + 失败诊断 + 非流式重试
   cfg = { title, steps, expectChars, messages(), params, parse(text), apply(data, text),
           doneText, closeAfter, openLog } */
async function runAiJob(cfg) {
  /* 任务卡片和 AI.currentCtrl 都是全局唯一的：并发起第二个任务，第一个就再也中断不了，卡片也会串 */
  if (Job.t0 > 0 && !Job.finished) {
    alert('已经有一个 AI 任务在跑（见右下角卡片），等它结束或先点「中断」。');
    return { ok: false, error: aiError('已有 AI 任务在运行', { kind: 'busy' }) };
  }
  const steps = cfg.steps || ['连接本地服务', '提交请求', '接收模型输出', '解析结果', '写入项目'];
  const expectChars = Math.max(200, cfg.expectChars || 1500);
  const limit = cfg.logMax || 4000;
  const clip = (t) => {
    const s = t || '';
    return s.length > limit ? '…' + s.slice(-limit) : s;
  };

  const attempt = async (useStream) => {
    Job.start(cfg.title, { expectChars, steps, retry: () => { attempt(false); }, closeAfter: cfg.closeAfter });
    Job.step(0, '检查服务');

    if (!(await AI.health())) {
      const e = aiError('连不上本地服务', { kind: 'network', provider: AI.provider, model: AI.model, message: 'fetch /api/health 失败' });
      Job.fail(e);
      return { ok: false, error: e };
    }
    if (!AI.hasKey()) {
      const e = aiError(`没配置 ${AI.provider} 的 API Key`, { kind: 'upstream', status: 401, provider: AI.provider, model: AI.model });
      Job.fail(e);
      return { ok: false, error: e };
    }

    Job.step(1, `${useStream ? '流式' : '非流式'} · ${AI.model} · ${AI.provider}`);
    try {
      const msgs = cfg.messages();
      let text;
      if (useStream) {
        text = await AI.stream(msgs, (d, full) => {
          Job.data(full);
          Job.log(clip(full));
        }, cfg.params || {});
      } else {
        Job.step(2, '非流式 · 等待整段返回');
        text = await AI.chat(msgs, cfg.params || {});
        Job.data(text);
        Job.log(clip(text));
      }

      Job.step(3, `收到 ${(text || '').length.toLocaleString()} 字`);
      const data = cfg.parse ? cfg.parse(text) : text;
      Job.step(4, cfg.applyLabel || '写入项目');
      if (cfg.apply) cfg.apply(data, text);
      Job.done(cfg.doneText || '完成');
      return { ok: true, data, text };
    } catch (e) {
      const aborted = (e.diag && e.diag.kind === 'abort') || /已中断/.test(String(e.message || ''));
      if (aborted) {
        Job.finished = true;
        clearInterval(Job.tickTimer);
        Job.setPct(Job.pctValue || 0, '已中断');
        $('jobCancel').classList.add('hidden');
        Job.info('已中断，窗口可以直接关掉');
        return { ok: false, error: e };
      }
      Job.fail(e, () => { attempt(false); });
      return { ok: false, error: e };
    }
  };

  return attempt(true);
}

async function ensureAI() {
  const ok = await AI.health();
  autoPickProvider();
  updateAiBadge();
  renderAiStatus();
  if (!ok) {
    alert('没连上本地服务。\n\n请打开终端，进入 novel-studio 目录运行：\n  node server.js\n然后访问 http://127.0.0.1:8931');
    return false;
  }
  if (!AI.hasKey()) {
    openAiModal();
    $('aiMsg').textContent = '请先填入 ' + AI.provider + ' 的 API Key';
    return false;
  }
  return true;
}

/* ---------- 补齐章节（AI 只出前 20 章，其余按节拍填充） ---------- */

function makeChapter(no, vol, inIdx, count, pack, hero, enemy, ally, density, chapWords) {
  const func = beatFunc(vol.idx, inIdx, count, density);
  const pool = DATA.beatTpl[func] || DATA.beatTpl.press;
  const t = rnd(pool);
  const c = {
    hero, enemy, ally,
    place: rnd(pack.place), org: rnd(pack.org),
    item: pack.item || '信物',
    target: rnd(['那个人', '名单上的人', '最后一个证人', ally])
  };
  return {
    no, volId: vol.id, func, level: BEAT_LEVEL[func],
    title: chapterTitle(no),
    pov: hero,
    goal: fillTpl(t.goal, c), obstacle: fillTpl(t.obstacle, c),
    turn: fillTpl(t.turn, c), payoff: fillTpl(t.payoff, c), hook: fillTpl(t.hook, c),
    words: chapWords, ai: false
  };
}

function applyAiOutline(data, ctx) {
  const totalCh = Math.max(24, Math.round((ctx.totalWan * 10000) / ctx.chapWords));
  const pack = DATA.genrePack[ctx.genre] || DATA.genrePack['都市脑洞'];
  const hero = (data.hero && String(data.hero).trim()) || ctx.hero || genPerson({ style: '冷峻', gender: '男', len: '2' }).text;
  const c = data.core || {};

  S.project = {
    title: S.project.title, genre: ctx.genre, totalWan: ctx.totalWan,
    chapWords: ctx.chapWords, vols: ctx.volCount, density: ctx.density, raw: ctx.raw, hero
  };

  S.core = {
    oneLine: c.oneLine || oneLine(ctx.raw),
    gold: c.gold || '', conflict: c.conflict || '',
    keys: extractKeys(ctx.raw, 7).join(' / '),
    turn1: c.turn1 || '', turn2: c.turn2 || '', turn3: c.turn3 || '',
    dark: c.dark || '', ending: c.ending || '',
    enemy: '', ally: '', totalCh
  };

  let vols = Array.isArray(data.volumes) ? data.volumes.filter((v) => v && (v.name || v.goal)) : [];
  if (!vols.length) {
    for (let i = 0; i < ctx.volCount; i++) {
      const t = pickVolTpl(i, ctx.volCount);
      vols.push({ name: `卷${cn(i + 1)} · ${t.name.split('·')[1].trim()}`, goal: t.goal, enemy: '', map: '', arc: t.arc, climax: t.climax });
    }
  }

  const n = vols.length;
  const weights = [];
  for (let i = 0; i < n; i++) weights.push(1 + 0.3 * Math.sin((Math.PI * i) / Math.max(1, n - 1)));
  const wSum = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  S.volumes = vols.map((v, i) => {
    const cnt = i === n - 1 ? totalCh - acc : Math.max(6, Math.round((totalCh * weights[i]) / wSum));
    const from = acc + 1, to = acc + cnt;
    const item = {
      id: 'v' + i, idx: i,
      name: v.name || `卷${cn(i + 1)}`,
      fromCh: from, toCh: to,
      goal: v.goal || '', enemy: v.enemy || '', map: v.map || '', arc: v.arc || '', climax: v.climax || ''
    };
    acc = to;
    return item;
  });
  S.volumes[S.volumes.length - 1].toCh = totalCh;

  const chars = Array.isArray(data.characters) ? data.characters.filter((x) => x && x.name) : [];
  const nameToId = {};
  S.chars = chars.map((ch, i) => {
    const id = 'c_ai' + i;
    nameToId[String(ch.name).trim()] = id;
    return {
      id, name: String(ch.name).trim(), alias: '',
      role: ROLES.indexOf(ch.role) >= 0 ? ch.role : (i === 0 ? '主角' : '配角'),
      faction: '', tags: ch.tags || '', motive: ch.motive || '', flaw: ch.flaw || '',
      arc: ch.arc || '', catchphrase: ch.catchphrase || '',
      firstCh: Math.max(1, +ch.firstCh || 1), notes: ''
    };
  });
  if (!S.chars.length) {
    S.chars = [{ id: 'c_hero', name: hero, alias: '', role: '主角', faction: '', tags: '', motive: '', flaw: '', arc: '', catchphrase: '', firstCh: 1, notes: '' }];
    nameToId[hero] = 'c_hero';
  }

  S.rels = (Array.isArray(data.relations) ? data.relations : [])
    .filter((r) => r && nameToId[r.from] && nameToId[r.to] && nameToId[r.from] !== nameToId[r.to])
    .map((r) => ({
      from: nameToId[r.from], to: nameToId[r.to],
      type: RELTYPES.indexOf(r.type) >= 0 ? r.type : '利益',
      strength: clamp(+r.strength || 3, 1, 5), note: '',
      fromCh: clamp(+r.fromCh || 1, 1, 9999),
      toCh: r.toCh ? clamp(+r.toCh, 1, 9999) : null,
      ...(r.both ? { both: true } : {})
    }))
    .filter((r, i, arr) => arr.findIndex((x) => x.from === r.from && x.to === r.to && x.type === r.type) === i);

  const enemyChar = S.chars.find((x) => x.role === '反派');
  const allyChar = S.chars.find((x) => x.role === '盟友') || S.chars.find((x) => x.role === '导师');
  const enemyName = enemyChar ? enemyChar.name : '对手';
  const allyName = allyChar ? allyChar.name : '同伴';
  S.core.enemy = enemyName;
  S.core.ally = allyName;
  S.ui.selChar = (S.chars.find((x) => x.role === '主角') || S.chars[0]).id;

  const aiMap = new Map();
  (Array.isArray(data.chapters) ? data.chapters : []).forEach((ch) => {
    if (ch && ch.no) aiMap.set(+ch.no, ch);
  });

  const chapters = [];
  for (let no = 1; no <= totalCh; no++) {
    const vol = S.volumes.find((v) => no >= v.fromCh && no <= v.toCh) || S.volumes[S.volumes.length - 1];
    const inIdx = no - vol.fromCh;
    const count = vol.toCh - vol.fromCh + 1;
    const ai = aiMap.get(no);
    if (ai) {
      const func = beatFunc(vol.idx, inIdx, count, ctx.density);
      chapters.push({
        no, volId: vol.id, func, level: Math.max(2, BEAT_LEVEL[func]),
        title: ai.title || `第${no}章`, pov: ai.pov || hero,
        goal: ai.goal || '', obstacle: ai.obstacle || '', turn: ai.turn || '',
        payoff: ai.payoff || '', hook: ai.hook || '',
        words: ctx.chapWords, ai: true
      });
    } else {
      chapters.push(makeChapter(no, vol, inIdx, count, pack, hero, enemyName, allyName, ctx.density, ctx.chapWords));
    }
  }
  S.chapters = chapters;
  S.ui.selChapter = 1;

  save();
  renderAll();
  $('outlineResult').classList.remove('hidden');
  $('genInfo').textContent = `AI 生成 · ${totalCh} 章 / ${S.volumes.length} 卷 / ${S.chars.length} 个人物（前 ${aiMap.size} 章为 AI 细纲）`;
  $('outlineResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function aiGenerateOutline() {
  const raw = $('rawOutline').value.trim();
  if (raw.length < 20) { alert('大纲太短了，至少 20 个字，把人物、处境、异常各说一句。'); return; }
  if (S.chapters.length && !confirmOverwriteText()) return;
  if (!(await ensureAI())) return;

  const ctx = {
    raw,
    genre: $('pGenre').value,
    totalWan: clamp(+$('pTotal').value || 100, 10, 500),
    chapWords: clamp(+$('pChapWords').value || 2000, 1500, 4000),
    volCount: clamp(+$('pVols').value || 6, 3, 10),
    density: +$('pDensity').value || 3,
    hero: $('pHero').value.trim()
  };

  $('aiGenBtn').classList.add('busy');
  try {
    await runAiJob({
      title: 'AI 正在拆解大纲',
      expectChars: 6000,
      steps: ['连接本地服务', '提交请求', '接收模型输出', '解析大纲 JSON', '写入项目'],
      messages: () => [
        { role: 'system', content: PROMPTS.outlineSystem },
        { role: 'user', content: PROMPTS.outlineUser(ctx) }
      ],
      params: { json: true, temperature: 0.9, maxTokens: 8000 },
      parse: (text) => parseJsonLoose(text),
      apply: (data) => applyAiOutline(data, ctx),
      doneText: '大纲已应用',
      closeAfter: 700,
      logMax: 6000
    });
  } finally {
    $('aiGenBtn').classList.remove('busy');
  }
}

async function aiContinue() {
  const no = S.ui.selChapter;
  if (!no) { alert('先在左边目录里选一章。'); return; }
  const c = S.chapters.find((x) => x.no === no);
  if (!c) return;
  if (!(await ensureAI())) return;

  const ctx = {
    title: S.project.title, genre: S.project.genre, no,
    chapter: c, words: S.project.chapWords,
    charLines: S.chars.filter((x) => (x.firstCh || 1) <= no).slice(0, 6)
      .map((x) => `- ${x.name}（${x.role}）：${x.tags || '—'}｜动机 ${x.motive || '—'}｜口头禅 ${x.catchphrase || '—'}`).join('\n'),
    prevHook: (S.chapters.find((x) => x.no === no - 1) || {}).hook || '',
    prevTail: (S.texts[no - 1] || '').slice(-260)
  };

  $('aiWriteBtn').classList.add('busy');
  try {
    await runAiJob({
      title: `正在写第 ${no} 章`,
      expectChars: Math.max(600, ctx.words * 1.8),
      steps: ['连接本地服务', '提交请求', '接收模型输出', '清理正文', '写入编辑器'],
      messages: () => [
        { role: 'system', content: PROMPTS.continueSystem },
        { role: 'user', content: PROMPTS.continueUser(ctx) }
      ],
      params: { temperature: 0.9, maxTokens: Math.min(8000, Math.ceil(ctx.words * 2.2)) },
      apply: (raw) => {
        /* 生成要 40 秒左右，期间用户可能已经切到别的章。
           正文一律以「发起时的章号 no」为准写进 S.texts[no]，编辑器只在仍停留在这一章时才刷新，
           否则会把别章的内容串进来、再把这章原文覆盖掉。 */
        const clean = String(raw || '').trim();
        const old = (S.texts[no] || '').trim();
        S.texts[no] = old ? old + '\n\n' + clean : clean;
        if (S.ui.selChapter === no) {
          $('editor').value = S.texts[no];
          updateWordCount();
        }
        renderSideStats(); renderTree(); save();
      },
      doneText: '已写入编辑器',
      closeAfter: 400,
      logMax: 1200
    });
  } finally {
    $('aiWriteBtn').classList.remove('busy');
  }
}

async function aiCheck() {
  if (!S.core) { alert('先生成大纲。'); return; }
  if (!(await ensureAI())) return;

  const ctx = {
    core: [S.core.oneLine, S.core.gold, S.core.conflict, S.core.ending].filter(Boolean).join('\n'),
    chars: S.chars.map((c) => `${c.name}（${c.role}）：${c.motive}｜${c.flaw}｜登场第 ${c.firstCh} 章`).join('\n'),
    vols: S.volumes.map((v) => `${v.name}（${v.fromCh}-${v.toCh}）：${v.goal}｜${v.climax}`).join('\n'),
    chapters: S.chapters.slice(0, 30).map((c) => `第${c.no}章 ${c.title}：${c.goal}｜钩子 ${c.hook}`).join('\n')
  };

  $('aiCheckBtn').classList.add('busy');
  try {
    await runAiJob({
      title: 'AI 正在体检设定',
      expectChars: 1600,
      steps: ['连接本地服务', '提交请求', '接收模型输出', '整理结论'],
      messages: () => [
        { role: 'system', content: PROMPTS.checkSystem },
        { role: 'user', content: PROMPTS.checkUser(ctx) }
      ],
      params: { temperature: 0.3, maxTokens: 1600 },
      apply: (text) => Job.result(text),
      doneText: '体检完成',
      logMax: 1500
    });
  } finally {
    $('aiCheckBtn').classList.remove('busy');
  }
}

function bindEvents() {
  document.querySelectorAll('.nav-item').forEach((b) => { b.onclick = () => switchView(b.dataset.view); });

  $('genBtn').onclick = buildOutline;
  $('demoBtn').onclick = () => {
    $('rawOutline').value = '外卖员陈砚每天送单到凌晨，某天他发现自己能看见每个收件人头顶的倒计时。他想救人，却发现自己每提醒一个人，自己的倒计时就少一天。而他送的第一单，收件人写的是他自己的名字。';
    $('genBtn').click();
  };

  $('projTitle').oninput = () => { S.project.title = $('projTitle').value; save(); };
  $('themeBtn').onclick = () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; applyTheme(); save(); };
  $('exportBtn').onclick = exportProject;
  $('backupBtn').onclick = exportBackup;
  $('importBtn').onclick = () => $('importInput').click();
  $('importInput').onchange = (e) => { importBackupFile(e.target.files[0]); e.target.value = ''; };
  $('resetBtn').onclick = () => {
    if (!confirm('清空当前项目的全部数据（大纲、人物、正文）？此操作不可撤销。\n\n建议先点「备份」。')) return;
    saveDisabled = true;                 // 否则 pagehide 的 flushSave 会把清掉的数据又写回去
    clearTimeout(saveTimer);
    try { localStorage.removeItem(KEY); } catch (e) {}
    location.reload();
  };

  $('chapterVolFilter').onchange = (e) => { S.ui.volFilter = e.target.value; renderChapters(); save(); };

  $('addCharBtn').onclick = () => {
    const n = NAME_GEN.person({ style: '现代', gender: '男', len: '2', sur: 'random', ban: '' }).text;
    const id = 'c_' + Date.now();
    S.chars.push({ id, name: n, alias: '', role: '配角', faction: '', tags: '', motive: '', flaw: '', arc: '', catchphrase: '', firstCh: 1, notes: '' });
    S.ui.selChar = id;
    save(); renderCharList(); renderCharForm(); buildGraph(); startSim(0.7); drawGraph();
  };

  $('autoLayoutBtn').onclick = () => {
    gNodes.forEach((n) => {
      n.x = GW / 2 + (Math.random() - 0.5) * 320;
      n.y = GH / 2 + (Math.random() - 0.5) * 240;
      n.vx = 0; n.vy = 0;
    });
    startSim(1);
  };

  $('chFilter').oninput = (e) => {
    S.ui.chFilter = +e.target.value;
    $('chFilterVal').textContent = S.ui.chFilter;
    buildGraph(); startSim(0.35); drawGraph(); renderCharForm(); renderSideStats();
  };

  $('nameTabs').querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => {
      nameKind = t.dataset.kind;
      $('nameTabs').querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
      renderNamePrefs();
      $('nameResults').className = 'name-grid';
      $('nameResults').innerHTML = '';
      $('nameInfo').textContent = '';
    };
  });
  $('genNameBtn').onclick = generateNames;
  $('aiNameBtn').onclick = aiNames;
  $('clearFavBtn').onclick = () => { S.favNames = []; save(); renderFav(); };

  $('addFsBtn').onclick = addForeshadow;

  $('aiSettingsBtn').onclick = async () => { await AI.health(); updateAiBadge(); openAiModal(); };
  $('aiProvider').onchange = () => {
    AI.provider = $('aiProvider').value;
    renderModelList();
    AI.model = $('aiModel').value;
    saveAiPref(); renderAiStatus();
  };
  $('aiModel').oninput = () => { AI.model = $('aiModel').value.trim(); saveAiPref(); };
  $('aiSaveBtn').onclick = async () => {
    const p = $('aiProvider').value;
    const k = $('aiKey').value.trim();
    AI.provider = p;
    AI.model = $('aiModel').value.trim() || (AI_MODELS[p] || [''])[0];
    saveAiPref();
    try {
      if (k) {
        await AI.saveKey(p, k);
        $('aiMsg').textContent = '已保存 ' + p + ' 的 Key';
        $('aiKey').value = '';
      } else {
        $('aiMsg').textContent = '已保存模型偏好（Key 未改动）';
      }
      renderAiStatus(); updateAiBadge();
    } catch (e) {
      $('aiMsg').textContent = '保存失败：' + e.message;
    }
  };
  $('aiTestBtn').onclick = async () => {
    const p = $('aiProvider').value;
    const m = $('aiModel').value.trim() || (AI_MODELS[p] || [''])[0];
    if (!AI.hasKey(p)) { $('aiMsg').textContent = '这个服务商还没有存 Key'; return; }
    $('aiMsg').textContent = '测试中…';
    try {
      const t = await AI.chat([{ role: 'user', content: '只回复两个字：可用' }], { provider: p, model: m, maxTokens: 16, temperature: 0, timeout: 30000 });
      $('aiMsg').textContent = '连接正常：' + String(t).trim().slice(0, 24);
    } catch (e) {
      $('aiMsg').textContent = '失败：' + e.message;
    }
  };

  $('aiGenBtn').onclick = aiGenerateOutline;
  $('aiWriteBtn').onclick = aiContinue;
  $('aiCheckBtn').onclick = aiCheck;
  $('jobCancel').onclick = () => { AI.abort(); setJobInfo('已中断'); };
  $('jobMin').onclick = () => Job.toggle();
  $('jobClose').onclick = () => {
    if (!Job.finished) AI.abort();
    Job.hide();
  };
  /* 点标题也能收起，忙的时候只留一条进度 */
  $('jobTitle').onclick = () => Job.toggle();
  document.querySelectorAll('[data-close]').forEach((b) => {
    b.onclick = () => closeModal(b.dataset.close);
  });

  $('editor').oninput = () => {
    const no = S.ui.selChapter;
    if (!no) return;
    S.texts[no] = $('editor').value;
    updateWordCount(); renderSideStats(); save();
  };

  document.addEventListener('pointermove', (e) => {
    if (!gDrag) return;
    const svg = $('graphSvg');
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) * GW) / r.width;
    const py = ((e.clientY - r.top) * GH) / r.height;
    const nd = nodeOf(gDrag.id);
    if (!nd) return;
    nd.x = clamp(px + gDrag.ox, 46, GW - 46);
    nd.y = clamp(py + gDrag.oy, 40, GH - 34);
    gDrag.moved = true;
    updateGraphPos();
  });
  document.addEventListener('pointerup', () => { if (gDrag) { gDrag = null; startSim(0.3); } });

  window.addEventListener('resize', () => {
    if (S.ui.view !== 'chars') return;
    if (syncGraphSize()) { buildGraph(); startSim(0.6); }
    drawGraph();
  });
}

function init() {
  load();
  applyTheme();
  $('projTitle').value = S.project.title || '未命名作品';
  $('rawOutline').value = S.project.raw || '';
  $('pGenre').value = S.project.genre || '都市脑洞';
  $('pTotal').value = S.project.totalWan || 100;
  $('pChapWords').value = S.project.chapWords || 2000;
  $('pVols').value = S.project.vols || 6;
  $('pDensity').value = String(S.project.density || 3);
  $('pHero').value = S.project.hero || '';

  bindEvents();
  if (typeof bindRank === 'function') bindRank();
  renderNamePrefs();
  renderAll();
  switchView(S.ui.view || 'outline');
  $('saveState').textContent = S.chapters.length ? '已载入本地项目' : '新项目';
  if (LOAD_FAILED) {
    $('saveState').textContent = '读档失败，原数据已另存';
    $('saveState').classList.add('bad');
    setTimeout(() => alert('本地存档损坏，读不出来。\n\n原始数据没有丢：已原样保存在浏览器的 ' + KEY + '.corrupt 里（开发者工具 → Application → Local Storage 可取出）。\n当前显示的是空白项目，在你确认之前请不要大量编辑。'), 100);
  }

  loadAiPref();
  AI.health().then(() => { autoPickProvider(); updateAiBadge(); renderAiStatus(); });

  const params = new URLSearchParams(location.search);
  if (params.get('demo') === '1' && !S.chapters.length) $('demoBtn').click();
  if (params.get('ai') === '1') {
    setTimeout(() => { AI.health().then(() => { updateAiBadge(); openAiModal(); }); }, 400);
  }
  if (params.get('job') === '1') {
    setTimeout(() => {
      showJob('AI 正在拆解大纲');
      setJobLog('{\n  "hero": "陈砚",\n  "core": {\n    "oneLine": "外卖员能看见每个收件人头顶的倒计时",\n    "gold": "提醒一次可延后对方死亡，代价是自己减寿一天",\n    "conflict": "救人等于自杀"\n  },\n  "volumes": [');
      setJobInfo('模型 deepseek-chat · 通常 20–60 秒');
    }, 300);
  }
  if (params.get('an') === '1' && typeof runDemoAnalysis === 'function') {
    switchView('analyze');
    S.analysis = runDemoAnalysis();
  }
  const v = params.get('view');
  const th = params.get('theme');
  if (th === 'dark' || th === 'light') { S.theme = th; applyTheme(); }
  const ch = params.get('ch');
  if (ch && +ch > 0) {
    S.ui.chFilter = Math.min(+ch, S.chapters.length || 500);
    const sl = $('chFilter');
    if (sl) { sl.max = S.chapters.length || 500; sl.value = S.ui.chFilter; }
    $('chFilterVal').textContent = S.ui.chFilter;
    if (S.ui.view === 'chars') { buildGraph(); startSim(0.3); drawGraph(); renderCharForm(); renderSideStats(); }
  }
  if (v) {
    switchView(v);
    const nk = params.get('nk');
    if (nk && v === 'names') {
      const tab = document.querySelector(`#nameTabs [data-kind="${nk}"]`);
      if (tab) tab.click();
    }
    if (v === 'names') setTimeout(generateNames, 80);
  }
}

init();

