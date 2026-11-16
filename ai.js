/* 砚台 · AI 接入层：DeepSeek / OpenRouter */

function aiError(msg, diag) {
  const e = new Error(msg);
  e.diag = diag || {};
  return e;
}

const AI = {
  provider: 'deepseek',
  model: 'deepseek-chat',
  online: false,
  status: { deepseek: false, openrouter: false },
  lastRun: null,
  currentCtrl: null,

  async health() {
    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      if (!r.ok) throw new Error('bad status');
      const j = await r.json();
      this.online = true;
      this.status = j.providers || {};
      return true;
    } catch (e) {
      this.online = false;
      return false;
    }
  },

  async saveKey(provider, key) {
    const r = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, key })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || '保存失败');
    this.online = true;
    if (j.providers) this.status = j.providers;
    return j;
  },

  hasKey(provider) {
    return !!(this.status && this.status[provider || this.provider]);
  },

  abort() {
    if (this.currentCtrl) {
      try { this.currentCtrl.abort(); } catch (e) {}
      this.currentCtrl = null;
    }
  },

  async chat(messages, opts) {
    opts = opts || {};
    const t0 = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout || 180000);
    this.currentCtrl = ctrl;
    this.lastRun = {
      mode: 'plain', provider: opts.provider || this.provider, model: opts.model || this.model,
      startedAt: t0, ms: 0, chars: 0, chunks: 0, reasonChars: 0, finish: '', usage: null, sample: ''
    };
    try {
      const r = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          provider: opts.provider || this.provider,
          model: opts.model || this.model,
          messages,
          temperature: opts.temperature == null ? 0.8 : opts.temperature,
          max_tokens: opts.maxTokens,
          json: !!opts.json,
          stream: false
        })
      });
      const j = await r.json().catch(() => ({ error: '返回内容无法解析（不是 JSON）' }));
      this.lastRun.ms = Date.now() - t0;
      if (!r.ok) {
        throw aiError(j.error || ('请求失败 ' + r.status), j.diag || { kind: 'upstream', status: r.status });
      }
      const content = j.content || '';
      this.lastRun.chars = content.length;
      this.lastRun.finish = j.finish || '';
      this.lastRun.usage = j.usage || null;
      this.lastRun.requestId = j.requestId || '';
      this.lastRun.sample = content.slice(0, 800);
      if (!content) {
        throw aiError('模型返回了空内容', {
          kind: 'empty', provider: this.lastRun.provider, model: this.lastRun.model,
          finish: j.finish || '', usage: j.usage || null, requestId: j.requestId || '', mode: 'plain'
        });
      }
      return content;
    } catch (e) {
      this.lastRun.ms = Date.now() - t0;
      if (e.name === 'AbortError') throw aiError('已中断', { kind: 'abort' });
      throw e;
    } finally {
      clearTimeout(timer);
      this.currentCtrl = null;
    }
  },

  async stream(messages, onDelta, opts) {
    opts = opts || {};
    const ctrl = new AbortController();
    this.currentCtrl = ctrl;
    const t0 = Date.now();
    const run = {
      mode: 'stream', provider: opts.provider || this.provider, model: opts.model || this.model,
      startedAt: t0, ttfb: 0, ms: 0, chunks: 0, chars: 0, reasonChars: 0,
      finish: '', usage: null, sawDone: false, requestId: '', rawLines: 0, sample: '', json: opts.json !== false
    };
    this.lastRun = run;
    const timer = setTimeout(() => ctrl.abort(), opts.timeout || 300000);

    try {
      const r = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          provider: opts.provider || this.provider,
          model: opts.model || this.model,
          messages,
          temperature: opts.temperature == null ? 0.85 : opts.temperature,
          max_tokens: opts.maxTokens,
          json: !!opts.json,
          stream: true
        })
      });

      run.requestId = r.headers.get('x-upstream-request-id') || '';

      if (!r.ok) {
        const j = await r.json().catch(() => ({ error: '请求失败 ' + r.status }));
        throw aiError(j.error || ('请求失败 ' + r.status), j.diag || { kind: 'upstream', status: r.status });
      }

      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!run.ttfb) run.ttfb = Date.now() - t0;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          const s = line.trim();
          if (!s) continue;
          run.rawLines++;
          if (!s.startsWith('data:')) continue;
          const data = s.slice(5).trim();
          if (data === '[DONE]') { run.sawDone = true; continue; }
          if (!data) continue;
          try {
            const j = JSON.parse(data);
            if (j.usage) run.usage = j.usage;
            const ch = (j.choices && j.choices[0]) || {};
            const d = ch.delta || {};
            const piece = d.content || '';
            const think = d.reasoning_content || d.reasoning || '';
            if (think) run.reasonChars += String(think).length;
            if (ch.finish_reason) run.finish = ch.finish_reason;
            if (piece) {
              run.chunks++;
              run.chars += piece.length;
              full += piece;
              if (run.sample.length < 600) run.sample += piece;
              onDelta && onDelta(piece, full);
            }
          } catch (e) {
            if (run.rawLines < 6) run.sample += '‹无法解析的行› ' + data.slice(0, 120) + '\n';
          }
        }
      }
      run.ms = Date.now() - t0;

      if (!full) {
        throw aiError('模型返回了空内容', {
          kind: 'empty', provider: run.provider, model: run.model, finish: run.finish,
          usage: run.usage, reasonChars: run.reasonChars, chunks: run.chunks,
          rawLines: run.rawLines, sawDone: run.sawDone, requestId: run.requestId,
          mode: 'stream·' + (run.json ? 'json' : 'text'), sample: run.sample
        });
      }
      return full;
    } catch (e) {
      run.ms = Date.now() - t0;
      if (e.name === 'AbortError') throw aiError('已中断', { kind: 'abort', ms: run.ms });
      if (!e.diag) e.diag = { kind: 'network', provider: run.provider, model: run.model, ms: run.ms, message: e.message };
      throw e;
    } finally {
      clearTimeout(timer);
      this.currentCtrl = null;
    }
  },

  /* 把错误翻译成"人话 + 下一步怎么做" */
  explain(err) {
    const d = (err && err.diag) || {};
    const run = this.lastRun || {};
    const model = d.model || run.model || this.model;
    const provider = d.provider || run.provider || this.provider;

    if (d.kind === 'abort') {
      return { title: '已中断', reason: '你点了中断，或请求超时。', tips: [] };
    }

    if (d.kind === 'upstream') {
      const s = d.status;
      let reason = '上游接口拒绝了这次请求（HTTP ' + s + '）。';
      let tips = [];
      if (s === 401 || s === 403) {
        reason = 'API Key 无效、过期，或没有这个模型的权限。';
        tips = ['到「AI 设置」重新填一次 Key', '确认 Key 属于 ' + provider + ' 而不是别家'];
      } else if (s === 400) {
        reason = '上游认为请求不合法（HTTP 400）。最常见三种：模型名拼错、这个模型不支持 JSON 模式（response_format），或参数越界。';
        tips = [
          '核对模型名「' + model + '」' + (provider === 'openrouter' ? '（OpenRouter 必须带厂商前缀，如 deepseek/deepseek-chat）' : ''),
          '关掉 JSON 模式或换一个模型再试',
          '展开下面「上游原始响应」，把 message 发我'
        ];
      } else if (s === 404) {
        reason = '模型名「' + model + '」在这个服务商上不存在。';
        tips = ['到「AI 设置」换一个模型', provider === 'deepseek' ? 'DeepSeek 只有 deepseek-chat 和 deepseek-reasoner' : 'OpenRouter 的模型名必须带厂商前缀，如 deepseek/deepseek-chat'];
      } else if (s === 429) {
        reason = '触发限流或额度用尽。';
        tips = ['等 30 秒再试', '换个模型，或检查账户余额'];
      } else if (s === 402) {
        reason = '账户余额不足。';
        tips = ['去服务商后台充值'];
      } else if (s >= 500) {
        reason = '上游服务故障（HTTP ' + s + '）。';
        tips = ['稍后重试', '换个 provider 试试'];
      }
      return { title: '上游报错 ' + s, reason, tips, body: d.body };
    }

    if (d.kind === 'empty') {
      if (d.reasonChars > 0 && d.chunks === 0) {
        return {
          title: '模型只输出了推理，没有正文',
          reason: '这个模型是推理模型（reasoning），把 token 全花在思考上了，正文被挤没了。已收到思考过程 ' + d.reasonChars + ' 字，正文 0 字。',
          tips: ['换非推理模型：deepseek-chat / gpt-4o / claude-sonnet', '或把 max_tokens 调大（当前任务已是 2600+）']
        };
      }
      if (d.finish === 'length') {
        return {
          title: '输出被长度上限截断',
          reason: 'max_tokens 用完了还没写出正文，finish_reason = length。',
          tips: ['把 max_tokens 调大', '减少一次生成的数量（比如一次取 12 个名字）']
        };
      }
      if (d.finish === 'content_filter') {
        return {
          title: '内容被安全策略拦截',
          reason: '上游的安全过滤把输出拦掉了。',
          tips: ['换个说法重试', '换一个模型（不同厂商策略不一样）']
        };
      }
      if (d.rawLines === 0) {
        return {
          title: '上游一个字节都没返回',
          reason: 'HTTP 200 但流里没有任何数据行。通常是这个模型不支持流式，或服务商把请求吞了。',
          tips: ['点下面的「用非流式重试」', '换一个模型']
        };
      }
      return {
        title: '模型返回了空内容',
        reason: '请求走通了，但 content 是空的。读了 ' + (d.rawLines || 0) + ' 行流数据，finish_reason = ' + (d.finish || '未给出') + '。',
        tips: ['点下面「用非流式重试」', '关掉 JSON 模式再试（有些模型不支持 response_format）', '换一个模型']
      };
    }

    if (d.kind === 'network') {
      return {
        title: '连不上本地服务或上游',
        reason: d.message || '请求没发出去。',
        tips: ['确认终端里 node server.js 还在跑', '确认访问的是 http://127.0.0.1:8931 而不是直接双击 HTML']
      };
    }

    return { title: '调用失败', reason: (err && err.message) || '未知错误', tips: [] };
  }
};

/* ---------- 提示词 ---------- */

const PROMPTS = {
  outlineSystem: `你是中文网络小说的资深责编，做过多年番茄、起点男频签约。你的任务是把一个粗糙灵感拆成可以直接开写的商业大纲。
硬性要求：
1. 只输出 JSON，不写任何解释、不写 markdown 代码块。
2. 所有字段都用中文，句子要具体，不要写“待定”“某某”“等等”。
3. 金手指必须写清代价与限制，没有限制的金手指视为不合格。
4. 反派的行为必须有自洽动机，不能靠降智衬托主角。
5. 第一章必须在前 300 字内出现冲突，章末必须留钩子。`,

  outlineUser(ctx) {
    return `灵感：${ctx.raw}

题材：${ctx.genre}
目标总字数：${ctx.totalWan} 万字
单章字数：${ctx.chapWords} 字
分卷数：${ctx.volCount} 卷
主角名：${ctx.hero || '请你取一个符合题材的名字'}

请输出如下结构的 JSON：
{
  "hero": "主角姓名",
  "core": {
    "oneLine": "一句话核心梗，带反差",
    "gold": "金手指公式：能做什么 + 代价是什么 + 限制是什么",
    "conflict": "贯穿全书的核心冲突",
    "turn1": "第一次大转折（约全书 1/4 处）",
    "turn2": "中点反转",
    "turn3": "第二次大转折（约全书 3/4 处）",
    "dark": "暗黑时刻：主角失去什么",
    "ending": "结局，要收束主线并留下余味"
  },
  "volumes": [
    { "name": "卷一 · 两字卷名", "goal": "本卷主角要达成的具体目标", "enemy": "本卷对手层级", "map": "主要地图与势力", "arc": "本卷人物弧光推进", "climax": "卷末高潮事件" }
  ],
  "characters": [
    { "name": "姓名", "role": "主角/反派/盟友/导师/配角/对照组", "tags": "两三个鲜明标签", "motive": "核心动机", "flaw": "性格缺陷", "arc": "成长弧光", "catchphrase": "口头禅", "firstCh": 1 }
  ],
  "relations": [
    { "from": "人物名", "to": "人物名", "type": "亲属/师徒/盟友/敌对/利益/情感/上下级", "strength": 3, "both": true, "fromCh": 1, "toCh": null }
  ],
  "chapters": [
    { "no": 1, "title": "章标题", "pov": "视角人物", "goal": "本章目标", "obstacle": "阻碍", "turn": "转折", "payoff": "爽点或收获", "hook": "章末钩子" }
  ]
}

约束：
- volumes 恰好 ${ctx.volCount} 个，按顺序覆盖全书，卷名不要重复。
- characters 输出 6 到 10 个，必须包含主角和主要反派。
- relations 中的人物名必须出现在 characters 里。
- both 表示双向同质关系（如互相敌对、彼此是盟友）；一方单方面对待另一方时省略该字段或写 false。
  若两人互相之间的关系性质不同，请拆成两条记录（如 A→B 盟友、B→A 利益）。
- 关系的生命周期用章节号标出：fromCh 是关系建立章，toCh 是关系结束章。
  贯穿全书的关系 toCh 写 null；会翻脸、会断的关系必须给 toCh，并且要给出一个在剧情上说得通的转折点章号。
  总章数按 ${Math.round(ctx.totalWan * 10000 / ctx.chapWords)} 章估算，toCh 不得超过它。
- 同一对人物的关系可以分几段：先盟友后敌对，就写成两条记录——第一条 toCh 是决裂前那章，第二条 fromCh 是决裂那章、toCh 为 null。这种断裂是全书最重要的戏，至少安排一对。
- chapters 只写前 20 章，必须紧扣第一卷目标，节奏要快。
- 不要输出 JSON 以外的任何字符。`;
  },

  continueSystem: `你是中文网络小说的连载作者，擅长写快节奏的男频爽文。
写作要求：
1. 直接输出正文，不要标题、不要“第X章”、不要任何解释。
2. 短句为主，对话推进剧情，少写环境描写和心理独白。
3. 每一段都要推进情节，不要复述已有信息。
4. 结尾必须落在给出的章末钩子上，留悬念。
5. 严格守住人物设定，不能出现未登场的角色。`,

  continueUser(ctx) {
    return `作品：${ctx.title}（${ctx.genre}）
本章是第 ${ctx.no} 章《${ctx.chapter.title}》

本章任务：
- 目标：${ctx.chapter.goal}
- 阻碍：${ctx.chapter.obstacle}
- 转折：${ctx.chapter.turn}
- 爽点：${ctx.chapter.payoff}
- 章末钩子：${ctx.chapter.hook}

出场人物：
${ctx.charLines || '（沿用前文主要人物）'}

上一章结尾：${ctx.prevHook || '这是第一章'}
${ctx.prevTail ? '\n上一章最后一段（用于衔接语气，不要重复内容）：\n' + ctx.prevTail : ''}

请写 ${ctx.words} 字左右的本章正文。`;
  },

  checkSystem: `你是网文编辑，负责给稿件挑硬伤。只输出问题清单，每条一行，按严重程度排序，不超过 8 条。没有问题时输出“未发现明显硬伤”。不要说客套话。`,

  checkUser(ctx) {
    return `请检查以下小说设定与章纲是否存在逻辑硬伤，重点看：战力/等级是否越级、时间线是否冲突、人物动机是否断裂、伏笔是否埋了不收。

核心设定：
${ctx.core}

人物：
${ctx.chars}

卷纲：
${ctx.vols}

前 30 章章纲：
${ctx.chapters}`;
  },

  /* ---------- 取名 ---------- */

  namesSystem: `你是中文网络小说的取名专家，给作家批量供应能直接写进正文的名字。只输出 JSON，不写任何解释。
要求：
1. 像真人名、真地名、真门派，不要生僻字堆砌，不要「龙傲天」式浮夸，不要网文烂大街的组合。
2. 同一批里不许重名、不许同音、不许只差一个字。
3. 释义（sub）写 6–18 个字，说清这个名字带来的联想、适合什么身份，不要写「含义深刻」「寓意美好」这类废话。
4. 用户消息里给的 JSON 只是**格式示范**，里面的名字一个都不许直接使用，必须自己重新拟。`,

  namesUser(ctx) {
    return `题材：${ctx.genre}
要取的类型：${ctx.kindLabel}
数量：${ctx.count}

约束：
${ctx.lines}
${ctx.avoid ? '已有主要人物（不要重名、不要撞音、不要只差一个字）：' + ctx.avoid : ''}

只输出：
{"names":[{"text":"名字","sub":"一句说明"}]}`;
  },

  lineageUser(ctx) {
    if (ctx.kind === 'family') {
      return `题材：${ctx.genre}
请为一本小说设计一个**家族谱系**。
姓氏：${ctx.surname || '（你定，要常见、好念）'}
名字气质：${ctx.style}
世代数：${ctx.gens}
每代人数：${ctx.per}
${ctx.avoid ? '已有主要人物（不要重名、不要撞音）：' + ctx.avoid : ''}

规则：
- 每一代用一个字辈字，全部世代连起来必须是一首自拟字辈诗里的连续几字（五言或七言都行），古诗现成的也可以。
- 字辈诗要有家族气，用「德、泽、守、承、绍、庭」这类字，不许出现生死、血、煞、冥这类凶字。
- 成员名 = 姓 + 字辈字 + 一个单字。单字不要生僻，同代之间不许重复，跨代也不许重复（前代用了「铮」，后代的单字就不能再用「铮」）。
- 同代看得出是一家人；不同代气质要有递进——老一辈更旧派守成，后辈可以更锋利或更现代。
- 每代人数必须严格等于 ${ctx.per}，label 必须写成「第N代 · X字辈」。
- 下面 JSON 里的名字只是格式示范，一个都不许直接用，姓、字辈诗、人名全部自己拟。

只输出：
{"title":"何家","subtitle":"字辈：永 · 怀 · 先 · 祖","groups":[{"label":"第一代 · 永字辈","members":["何永山","何永川","何永年"]}]}`;
    }
    return `题材：${ctx.genre}
请为一本小说设计一个**宗门谱系**。
宗门名：${ctx.sectName || '（你定，两到四字，要有门派气）'}
${ctx.avoid ? '已有主要人物（不要重名、不要撞音）：' + ctx.avoid : ''}

规则：
- 严格五层，人数依次为 1 / 2 / 3 / 4 / 5。
- label 必须严格写成这五个：掌门 · X字辈、首座长老 · X字辈、真传弟子 · X字辈、内门弟子 · X字辈、外门弟子 · X字辈。
- 每层用一个字派字，五字连起来要像一句修道门规或字派诗；用「清、静、玄、微、止、衡」这类字，不许出现死、血、煞、冥、鬼。
- 道号 = 字派字 + 一个单字（虚、玄、尘、涯、衡、岚 这类），全宗不许有重复的单字。
- 掌门那一层只能有一个人。
- 下面 JSON 里的名字只是格式示范，一个都不许直接用，宗门名、字派诗、道号全部自己拟。

只输出：
{"title":"枯荣阁","subtitle":"字派：清 · 静 · 无 · 为 · 道","groups":[{"label":"掌门 · 清字辈","members":["清岚"]},{"label":"首座长老 · 静字辈","members":["静川","静垣"]}]}`;
  }
};

/* ---------- JSON 容错解析 ---------- */
function parseJsonLoose(text) {
  if (!text) throw new Error('模型没有返回内容');
  let s = String(text).trim();

  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);

  try { return JSON.parse(s); } catch (e) {}

  const fixed = s
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
  try { return JSON.parse(fixed); } catch (e) {
    throw new Error('模型返回的不是合法 JSON，请重试或换个模型');
  }
}
