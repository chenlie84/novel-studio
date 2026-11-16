/* 砚台 · 竞品榜：番茄男频阅读榜 / 起点月票榜 TOP10
   数据口径见 RANK_BOARDS[].note，检索日 2026-11-16。
   conf: '可查' = 设定/玩法公开可查；'推断' = 只按书名、分类、榜单位置推断，未读原文。 */

const RANK_BOARDS = [
  {
    id: 'fanqie',
    name: '番茄 · 男频阅读榜',
    asof: '检索日 2026-11-16',
    note: '按「在读人数」排序的男频总榜，第三方榜单向导聚合；热度数字仅部分条目可查。',
    items: [
      {
        n: 1, title: '神通者', author: '天蚕土豆', genre: '传统玄幻', ext: '连载 · 25 万字', heat: '在读 195 万', conf: '推断',
        one: '土豆新书上线即榜首：老牌大神的存量读者 + 传统玄幻基本盘，25 万字就压过一堆完本神作。',
        hook: '公开信息有限，但按他的老套路，第 1 章必然给一个「异常开局」，3 章内完成第一次实力兑现。',
        learn: [
          '榜首不靠字数：25 万字能压 400 万字完本，说明番茄的榜位看「当下在读」而不是总篇幅',
          '传统玄幻在番茄仍有位置，但门槛变成了「作者 IP + 开局兑现速度」，纯慢热起不来',
          '想学它的开篇，去拆前 10 章，重点看第 1 章把什么信息前置了'
        ]
      },
      {
        n: 2, title: '十日终焉', author: '杀虫队队员', genre: '悬疑脑洞', ext: '完结 · 320 万字', heat: '在读 179.8 万', conf: '可查',
        one: '死亡游戏 + 规则解谜 + 谎言博弈，主角靠推理在副本里活下来，硬核智斗流的标杆。',
        hook: '睁眼在一个不合理的空间，墙上写着必须遵守的规则，马上有人违反并当场死掉。',
        learn: [
          '每个副本本质是一道「规则题」，读者能跟着一起推 → 追更动力是解题欲，不是打脸',
          '主角信息少、能力弱，靠观察和试错破局 → 悬念密度天然高，不需要反派降智',
          '完本 320 万字仍在榜：悬疑脑洞的长线留存靠「世界观悬念」而非单章爽点'
        ]
      },
      {
        n: 3, title: '我不是戏神', author: '三九音域', genre: '都市高武', ext: '完结 · 400 万字', heat: '在读 172.9 万', conf: '可查',
        one: '戏班少年在「戏神」体系里借戏曲行当悟道，把生旦净末丑变成战斗职业，设定自成一派。',
        hook: '开场就把主角按在「戏班底层」，用一场被砸的戏台把处境、尊严和怒点一次讲完。',
        learn: [
          '拿一个本土文化母题（戏曲行当）当力量体系 → 差异化极强，而且天然可视觉化（利于短剧改编）',
          '主角靠「借角色」破局，每场战斗都有策略层，不是纯数值升级',
          '400 万字不烂尾，是因为体系可扩展：一个行当就是一套新玩法'
        ]
      },
      {
        n: 4, title: '规则怪谈：无所谓，系统会出手', author: '巡山主神', genre: '悬疑脑洞', ext: '连载', heat: '', conf: '推断',
        one: '规则怪谈 + 系统兜底：把「规则恐怖」的压迫感用金手指卸掉一半，门槛更低、受众更宽。',
        hook: '书名就把解法剧透了 —— 读者进场不是怕主角死，而是等着看系统怎么出手。',
        learn: [
          '规则怪谈原本爽在「猜规则」，加系统等于给读者一个安全阀：恐怖感下降、爽点上升，覆盖面变大',
          '关键在于金手指只能「解释/绕过规则」，不能「无视规则」，否则悬念立刻归零',
          '同作者另一本《boss 阴到没边，我的系统也是》也在前十 → 这个配方可批量复制'
        ]
      },
      {
        n: 5, title: '这个游戏不对劲，我挖矿成神！', author: '道不易', genre: '玄幻脑洞', ext: '连载', heat: '', conf: '推断',
        one: '游戏化异世界 + 挖矿积累：把「资源经营」塞进玄幻脑洞，进度条肉眼可见。',
        hook: '书名把玩法写在脸上（挖矿 → 成神），点进来的人已经知道要看什么。',
        learn: [
          '「挖矿」这种可量化的积累动作，比抽象的「修炼」更容易让读者感到在推进',
          '番茄式命名：题材 + 玩法 + 结果，标题即广告，不玩含蓄',
          '想复用：找一个现实里人人都会的重复劳动（送外卖、搬砖、种地），把它变成升级方式'
        ]
      },
      {
        n: 6, title: '我在精神病院学斩神', author: '三九音域', genre: '都市高武', ext: '完结 · 426 万字', heat: '在读 133.1 万', conf: '可查',
        one: '「精神病院 + 守夜人」的国产高武样本：把疯子写成战友，热血与悲情并重。',
        hook: '主角被扔进精神病院，读者先认定他疯了，再看着「疯子」一个个显出真身。',
        learn: [
          '设定钩子一句话说清且反常识（在精神病院学斩神）→ 标题就是最好的简介',
          '群像：每个病人是一张人物卡，天然长出关系网和支线，不用硬编',
          '情感浓度高于纯爽文 → 都市高武也能靠「悲壮」留人，不必只堆打脸'
        ]
      },
      {
        n: 7, title: '系统想害我，我选择上交国家', author: '超级吹宝泡泡糖', genre: '都市脑洞', ext: '连载', heat: '', conf: '推断',
        one: '系统流 + 家国向：主角不硬扛系统，直接把难题交给国家机器来解决。',
        hook: '第一句就把冲突立住 —— 系统要坑我，那我不跟你玩，我找更强的靠山。',
        learn: [
          '「上交国家」是近两年番茄都市脑洞的高频解法：把个人困境升级成组织行动，格局立刻变大',
          '爽点从「我变强」换成「国家队出手」，读者代入的是集体而不是个人',
          '同作者《系统任务太难？国家：放着我来》同题在榜 → 一个配方反复用，别怕重复'
        ]
      },
      {
        n: 8, title: '天渊', author: '沐潇三生', genre: '传统玄幻', ext: '连载 · 614.6 万字', heat: '在读 123.5 万', conf: '推断',
        one: '超长篇传统玄幻，600 万字仍在榜，靠世界观与修炼体系的完整度吃长线。',
        hook: '长篇的开局通常是「小人物 + 一桩超出他层级的事」，靠悬念把人拖住而不是靠爽点。',
        learn: [
          '长篇不是原罪：番茄也有百万级「慢热书」的读者池，只是入口更难',
          '它卖的是「体系完整度」，不适合当第一本练手 —— 新手容易在 30 万字处塌',
          '想学长篇，重点拆它的「境界表 + 势力表」怎么分层，而不是学文笔'
        ]
      },
      {
        n: 9, title: '文字武侠：开局破庙夜会帮主夫人', author: '我想下海', genre: '玄幻脑洞', ext: '连载', heat: '', conf: '推断',
        one: '把武侠打斗翻译成「文字/面板」玩法，标题直接用开局场景当钩子。',
        hook: '破庙、夜、帮主夫人 —— 一句话给出场景、身份反差和暧昧张力，点了才知道是怎么回事。',
        learn: [
          '番茄书名公式：题材前缀（文字武侠）+ 冒号 + 开局钩子，这是可抄的结构',
          '「帮主夫人」这类身份自带禁忌感，比「一个女子」点击率高得多',
          '文字流的核心是把打斗写成读者能读的「判定过程」，不是真的堆面板'
        ]
      },
      {
        n: 10, title: '全球死考：刚下刑场你让我去考试', author: '我爱吃猫片哇', genre: '悬疑脑洞', ext: '连载', heat: '', conf: '推断',
        one: '全球规则类 + 荒诞开局：全人类被迫参加考试，考不过就死。',
        hook: '主角刚下刑场，通知来了：去考试。荒诞反差就是点击率。',
        learn: [
          '「全球 XX」是番茄最好懂的模板（全球死考 / 全球高武 / 全球降临），一句话说清世界观',
          '规则类要在前 3 章给出「规则清单」，读者才能跟着算答案、参与推理',
          '荒诞反差负责点开率，规则设计负责留存 —— 两件事都要有'
        ]
      }
    ]
  },
  {
    id: 'qidian',
    name: '起点 · 月票榜',
    asof: '榜单更新 2026-11-02',
    note: '起点官方全站月票榜，反映「愿意为它花钱投票」的核心读者盘，不是新读者量。',
    items: [
      {
        n: 1, title: '神宠供应商', author: '轻泉流响', genre: '轻小说', ext: '月票 16,238', heat: '月票榜第 1', conf: '推断',
        one: '轻小说分类登顶全站月票榜：宠物/御兽向的「养成 + 陪伴」路线拿到了最高票。',
        hook: '轻小说的开局通常极轻：一个可爱的异常先出场，主角的处境随后补。',
        learn: [
          '轻小说在起点的月票盘子里已经能压过玄幻 → 分类红利真实存在',
          '养成向天然长线：每一只宠物都是一张人物卡，读者会为「角色」投票',
          '月票靠粉丝黏性而非新读者量 → 稳定更新 + 群像塑造，比爆点更有用'
        ]
      },
      {
        n: 2, title: '夜无疆', author: '辰东', genre: '玄幻', ext: '月票 12,189', heat: '畅销榜第 1', conf: '推断',
        one: '辰东新书，玄幻基本盘的老牌大神局：宏大世界观 + 长线伏笔。',
        hook: '辰东式开局：一个看似平静的边地，一件说不清的怪事，一句不解释的旧话。',
        learn: [
          '辰东的读者要的就是「慢 + 大」，开篇慢是他的护城河，学他的人多半死在没人等',
          '同书在畅销榜、追读榜同时第一 → 大神书靠「三榜齐上」建立安全感',
          '如果你的笔力撑不住慢热，就别学他，去学榜单后半段的快节奏书'
        ]
      },
      {
        n: 3, title: '请勿高考时渡劫', author: '最白的乌鸦', genre: '都市', ext: '月票 12,170', heat: '都市分榜第 1', conf: '推断',
        one: '都市修仙 + 高考场景：把最全民的记忆点（高考）和渡劫嫁接在一起。',
        hook: '高考考场上，天雷来了。规则说「请勿高考时渡劫」—— 冲突和世界观一句话说完。',
        learn: [
          '「熟悉的日常 + 不合理的异常」是都市脑洞最稳的公式（高考 vs 渡劫）',
          '书名里的「请勿」写出了世界观规则：不是喊口号，是贴告示，读者秒懂',
          '都市分类也能出全站前三的月票书 → 别默认只有玄幻能吃月票'
        ]
      },
      {
        n: 4, title: '让仙门再次伟大', author: '鹤守月满池', genre: '玄幻', ext: '月票 9,458', heat: '玄幻畅销第 1', conf: '推断',
        one: '宗门建设流：主角把一个衰败门派重新做起来，模拟经营式修仙。',
        hook: '开局接过一个破宗门：欠债、没弟子、山门快塌了 —— 全是待办事项。',
        learn: [
          '建设流的爽点是「数值可见的变好」（弟子数、灵田、声望），每章都能给正反馈',
          '标题借梗（Make XX Great Again）→ 记忆点极强，且自带情绪',
          '玄幻畅销榜第一，说明这套商业模型已经验证，可迁移到「店铺/家族/公司」'
        ]
      },
      {
        n: 5, title: '玄鉴仙族', author: '', genre: '仙侠', ext: '月票 9,066', heat: '', conf: '推断',
        one: '家族流仙侠：以一族几代人的兴衰为单位推进，群像 + 权谋 + 慢火。',
        hook: '开局往往先给「一族之危」，主角是这一代里最不被看好的那个。',
        learn: [
          '把主角从「一个人」换成「一个家族」，时间跨度天然拉长，几十万字不显水',
          '族谱即人物表：每一代换个视角，读者不疲劳，作者也不缺素材',
          '可以直接接你的「家族体系取名 + 关系图谱」功能：先出族谱，再往里填人'
        ]
      },
      {
        n: 6, title: '没钱修什么仙？', author: '', genre: '仙侠', ext: '月票 8,756', heat: '', conf: '推断',
        one: '修仙 + 现实主义吐槽：把「穷」写成修仙路上的第一道门槛。',
        hook: '别人筑基靠灵石，主角筑基靠借钱 —— 第一个笑点就是第一个痛点。',
        learn: [
          '把现实焦虑（没钱、房贷、考编）塞进修仙 → 代入感和共情直接拉满',
          '书名是反问句，自带情绪和嘴替感，番茄和起点都吃这套',
          '吐槽流的关键是「吐槽完真的要解决问题」，只吐槽不给解法会掉读者'
        ]
      },
      {
        n: 7, title: '有仙则名', author: '', genre: '仙侠', ext: '月票 7,959', heat: '', conf: '推断',
        one: '仙侠基本盘，长线连载，围绕「名」这个概念做设定展开。',
        hook: '先给一个「无名之辈」的处境，再让「名」本身变成可修炼的东西。',
        learn: [
          '榜前常被「名字即设定」的书占位（有仙则名 / 让仙门再次伟大），标题本身就是设定',
          '成语/俗语改装成书名，读者一眼记住，且自带文化联想',
          '这类书的核心是把一个抽象概念（名、运、命）做成可量化的系统'
        ]
      },
      {
        n: 8, title: '剑烛大荒', author: '', genre: '玄幻', ext: '月票 7,222', heat: '', conf: '推断',
        one: '传统玄幻新书，靠「荒」系世界观的苍凉质感做差异。',
        hook: '开局先给环境：风沙、断剑、没人烟的边地，然后才给人。',
        learn: [
          '同是玄幻，用「世界质感」（大荒 / 边地 / 破败）跟主流的盛世流区分开',
          '玄幻分榜月票第 3、追读榜第 3 → 追读榜比月票榜更能看出新书留存',
          '写玄幻前先定「世界的第一印象是繁华还是荒凉」，这一条决定文风'
        ]
      },
      {
        n: 9, title: '廓晋', author: '', genre: '历史', ext: '月票 5,786', heat: '', conf: '推断',
        one: '历史向，晋代背景的权谋叙事，榜位长期稳健。',
        hook: '历史文开局通常是「一个不合时宜的人，被扔进一个正在崩塌的秩序里」。',
        learn: [
          '历史类能进全站月票前十 → 起点读者对「考据 + 权谋」的付费意愿很高',
          '历史文不靠爽点密度，靠「每个决策都成立」，读者会拿逻辑跟你较真',
          '想写历史先去补「制度 + 地理 + 物价」三张表，比背年号有用'
        ]
      },
      {
        n: 10, title: '武道！', author: '', genre: '玄幻', ext: '月票 5,364', heat: '玄幻分榜第 5', conf: '推断',
        one: '武道流玄幻，靠书名里的感叹号把情绪强度拉满。',
        hook: '一个「！」就把态度喊出来了：不解释、不铺垫，直接上。',
        learn: [
          '书名带「！」= 情绪强度信号，适合爽文，不适合慢热文',
          '武道流是玄幻里门槛最低的分支：设定简单、读者预期明确，适合练手',
          '同样是玄幻，月票相差 3 倍（16k vs 5k）→ 分类内部差距比跨分类更大'
        ]
      }
    ]
  }
];

const RANK_BOARD_MAP = {};
RANK_BOARDS.forEach((b) => { RANK_BOARD_MAP[b.id] = b; });

function rankState() {
  if (!S.rank || typeof S.rank !== 'object') S.rank = { board: 'fanqie', genre: 'all', bench: [] };
  if (!Array.isArray(S.rank.bench)) S.rank.bench = [];
  if (!RANK_BOARD_MAP[S.rank.board]) S.rank.board = 'fanqie';
  return S.rank;
}

function benchKey(boardId, title) { return boardId + '::' + title; }

function isBenched(boardId, title) {
  return rankState().bench.some((b) => b.key === benchKey(boardId, title));
}

function renderRank() {
  const st = rankState();
  const board = RANK_BOARD_MAP[st.board];
  const tabs = $('rankTabs');
  const list = $('rankList');
  if (!tabs || !list) return;

  /* 榜单切换 */
  tabs.innerHTML = RANK_BOARDS.map((b) => `
    <button class="rank-tab${b.id === st.board ? ' active' : ''}" data-board="${b.id}" type="button">
      ${esc(b.name)}<span class="rt-n">${b.items.length}</span>
    </button>`).join('');

  $('rankMeta').innerHTML = `
    <div class="rm-line"><b>${esc(board.name)}</b>　${esc(board.asof)}</div>
    <div class="rm-note">${esc(board.note)}</div>`;

  /* 题材分布 */
  const count = {};
  board.items.forEach((it) => { count[it.genre || '未标注'] = (count[it.genre || '未标注'] || 0) + 1; });
  const rows = Object.keys(count).sort((a, b) => count[b] - count[a]);
  const max = Math.max.apply(null, rows.map((r) => count[r]));
  $('rankDist').innerHTML = `
    <div class="rd-title">题材分布</div>
    <div class="rd-rows">${rows.map((r) => `
      <div class="rd-row">
        <span class="rd-name">${esc(r)}</span>
        <span class="rd-bar"><i style="width:${Math.round(count[r] / max * 100)}%"></i></span>
        <span class="rd-num">${count[r]}</span>
      </div>`).join('')}</div>
    <div class="rd-tip">我当前写的题材：<b>${esc(S.project.genre || '未设置')}</b>
      ${count[S.project.genre] ? `　本榜有 ${count[S.project.genre]} 本同赛道，重点看这几张卡` : '　本榜没有同赛道，注意是否选错了池子'}</div>`;

  /* 题材筛选 */
  const genres = ['all'].concat(rows);
  const filter = genres.includes(st.genre) ? st.genre : 'all';
  st.genre = filter;
  const chips = `<div class="rank-filter">${genres.map((g) => `
    <button class="rf-chip${g === filter ? ' on' : ''}" data-genre="${esc(g)}" type="button">
      ${g === 'all' ? '全部' : esc(g)}</button>`).join('')}</div>`;

  /* 卡片 */
  const items = board.items.filter((it) => filter === 'all' || (it.genre || '未标注') === filter);
  list.innerHTML = chips + items.map((it) => cardHtml(board.id, it)).join('') ||
    '<div class="panel"><p class="hint">这个题材下没有作品。</p></div>';

  renderBench();
}

function cardHtml(boardId, it) {
  const benched = isBenched(boardId, it.title);
  return `
  <div class="rk-card${benched ? ' benched' : ''}" data-title="${esc(it.title)}">
    <div class="rk-no">${it.n}</div>
    <div class="rk-main">
      <div class="rk-top">
        <b class="rk-name">${esc(it.title)}</b>
        ${it.author ? `<span class="rk-author">${esc(it.author)}</span>` : ''}
        <span class="rk-chip">${esc(it.genre || '未标注')}</span>
        ${it.ext ? `<span class="rk-chip gray">${esc(it.ext)}</span>` : ''}
        ${it.heat ? `<span class="rk-heat">${esc(it.heat)}</span>` : ''}
        <span class="rk-conf ${it.conf === '可查' ? 'ok' : ''}" title="${it.conf === '可查' ? '设定与玩法公开可查' : '按书名、分类与榜单位置推断，未读原文'}">${esc(it.conf)}</span>
      </div>
      <p class="rk-one">${esc(it.one)}</p>
      <p class="rk-hook"><span class="rk-lbl">开局</span>${esc(it.hook)}</p>
      <ul class="rk-learn">${it.learn.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <div class="rk-acts">
        <button class="btn small ghost" data-bench="${esc(it.title)}" data-boardid="${boardId}" type="button">${benched ? '★ 已对标' : '☆ 设为对标'}</button>
        <button class="btn small ghost" data-toline="${esc(it.title)}" type="button">照这个赛道开新书</button>
        <button class="btn small ghost" data-goanalyze="1" type="button">去拆它的原文</button>
      </div>
    </div>
  </div>`;
}

function renderBench() {
  const st = rankState();
  const box = $('rankBench');
  if (!box) return;
  if (!st.bench.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="panel-head">
      <h3>我的对标（${st.bench.length}）</h3>
      <button class="btn small ghost" data-benchclear="1" type="button">清空</button>
    </div>
    <div class="bench-list">${st.bench.map((b) => `
      <span class="bench-item">
        <b>${esc(b.title)}</b>
        <i>${esc(b.boardName)}</i>
        <button data-bench="${esc(b.title)}" data-boardid="${esc(b.board)}" type="button" title="移出">×</button>
      </span>`).join('')}</div>`;
}

function toggleBench(boardId, title) {
  const st = rankState();
  const key = benchKey(boardId, title);
  const i = st.bench.findIndex((b) => b.key === key);
  if (i >= 0) st.bench.splice(i, 1);
  else st.bench.push({ key, board: boardId, boardName: (RANK_BOARD_MAP[boardId] || {}).name || boardId, title });
  save();
  renderRank();
}

/* 把某本书的赛道搬到大纲页：题材对齐 + 一句可直接改的空白模板 */
function rankToOutline(boardId, title) {
  const board = RANK_BOARD_MAP[boardId];
  const it = board && board.items.find((x) => x.title === title);
  if (!it) return;

  const sel = $('pGenre');
  const want = it.genre || '';
  const opts = Array.from(sel.options);
  const hit = opts.find((o) => o.value === want || o.text === want)
    || opts.find((o) => want && (o.value.indexOf(want) === 0 || o.value.indexOf(want) > 0))
    || opts.find((o) => want && want.indexOf(o.value) > -1);
  if (hit) { sel.value = hit.value; S.project.genre = hit.value; }

  const tpl = `参考《${it.title}》（${it.genre}）的赛道：${it.one}\n\n` +
    `我的版本：把「${it.genre}」的壳换成一个我熟悉的场景——\n` +
    `主角：____（身份要低、要有具体职业）\n` +
    `异常：____（一句话说清，反常理，能写进书名）\n` +
    `代价：____（用了就要付什么，越具体越好）\n` +
    `第一个对手：____（比我高一级，但有软肋）\n` +
    `第一单/第一个任务：____（300 字内必须出事）`;
  $('rawOutline').value = tpl;
  S.project.raw = tpl;
  save();
  switchView('outline');
  const tip = $('rawOutline');
  tip.focus();
  tip.scrollTop = 0;
}

function bindRank() {
  const view = $('view-rank');
  if (!view) return;

  view.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;

    if (b.dataset.board) { rankState().board = b.dataset.board; rankState().genre = 'all'; save(); renderRank(); return; }
    if (b.dataset.genre) { rankState().genre = b.dataset.genre; save(); renderRank(); return; }

    if (b.dataset.bench) {
      const bId = b.dataset.boardid;
      if (bId) { toggleBench(bId, b.dataset.bench); return; }
      const owner = RANK_BOARDS.find((bd) => bd.items.some((x) => x.title === b.dataset.bench));
      toggleBench((owner && owner.id) || rankState().board, b.dataset.bench);
      return;
    }

    if (b.dataset.toline) {
      const owner = RANK_BOARDS.find((bd) => bd.items.some((x) => x.title === b.dataset.toline));
      rankToOutline((owner && owner.id) || rankState().board, b.dataset.toline);
      return;
    }

    if (b.dataset.goanalyze) {
      switchView('analyze');
      const zone = $('dropZone');
      if (zone) zone.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    if (b.dataset.benchclear) { rankState().bench = []; save(); renderRank(); }
  });
}
