import { useState, useRef, useEffect, useMemo } from 'react';
import { Sparkles, Send, Loader2, AlertCircle, Wand2, BarChart3, Target, Filter, Lightbulb, Copy, Check, RotateCcw, FileText, Database, RefreshCw, Search, Settings2 } from 'lucide-react';
import type { DeliveryLog } from '@/types';
import AIProviderSettings from './AIProviderSettings';
import {
  loadAISettings,
  syncAISettingsFromServer,
  postChat,
  getActiveConfig,
  getProviderLabel,
  validateConfig,
  getModelMaxTokens,
  AI_SETTINGS_EVENT,
  type AISettings,
} from '@/lib/aiProvider';
import { AI_RED_LINE_DEDUCTION } from '@/utils/scoringConstants';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

type ChatMode = 'data' | 'optimize';

interface PresetPrompt {
  label: string;
  text: string;
  icon: React.ReactNode;
  mode: ChatMode;
  // autoGenerate=true 时：以「当前提示词草稿」(promptDraft) 为起点，结合 1000 份真实投递数据数据驱动地生成/优化评分筛选提示词；草稿为空时要求先粘贴起点草稿
  autoGenerate?: boolean;
  // selfEvolve=true 时：自进化循环优化预设（每轮 +10 加分条目 / +10 减分条目，下一轮回测清理）
  selfEvolve?: boolean;
  // audit=true 时：排查提示词预设（基于最近 2000 条评分数据，找出草稿里从未被命中的加分/减分项）
  audit?: boolean;
}

// 候选人简历（已从 PDF 提取为纯文本，作为自进化优化提示词的固定素材）。
// 自进化循环每轮新增的「加分项目 / 减分项目」都必须基于这份真实简历背景，不编造简历外的技能/经历。
const RESUME_TEXT = `戚锦豪
求职意愿：AI产品经理 / 项目经理 / 技术运营
男 / 22 岁 / 汉族 / 江门开平 / 本科 / 13612258725 / 2455294890@qq.com
教育背景：五邑大学 通信工程 本科（计算机通信网络），2022-09 至 2026-06
相关课程：Python编程技术、Java Web开发、软件工程、算法设计与分析、数据库原理、工程经济与项目管理
个人优势：
1. 复合型背景：具备「AI产品研发」与「百万级公益项目」双重实习经验，熟悉从0到1的项目立项、数据生产、研发交付到SOP运营的全生命周期管理。
2. 项目管理能力：擅长跨部门资源协调与干系人沟通，能精准把控里程碑节点，具备较强的风险识别与问题闭环解决能力。
3. AI技术落地能力：熟悉大模型应用（智能体、RAG）与数据处理流程，掌握提示词工程与Vibe Coding，能高效推动AI技术在实际业务场景落地。
4. 团队协作与统筹：擅长建立常态化沟通机制（日/周报、复盘会），曾统筹20余人跨部门团队，主导两个展位的规划与现场调度，精细化管理将成本控制在预算65%以内，支撑展会累计接待超2万人次。
实习经历：
- AI开发工程师，幽莲数智（深圳）科技有限公司，2025-08 至 2025-11：作为公益基金会副秘书长与科技公司CEO的沟通桥梁，参与智能体研发；以传承人100+复盘会议纪要为核心，基于提示词工程生成5万条高质量JSON标准化数据集，编写脚本转化为向量化RAG知识库；使用飞书制定数据处理排期，对接并交付数据集给合作高校（深职院、深大等）；联合飞书与Way to AGI统筹AI技术交流活动深圳主会场，调度20余人团队，物料成本控制在预算65%以内，覆盖受众超2万人次。
- 项目助理，深圳市富道公益基金会，2025-07 至 2025-08：推动百万级公益项目「富道书香」全流程管理，含立项报告修订、SOP体系搭建、项目落地与工具优化；从0到1搭建项目运营SOP体系，制定社群主理人招募流程、资格审查表及志愿积分方案；组织并主导多方沟通会议10余场（含深圳市社会组织总会共建推进会）；开发申请信息汇总表，引入小程序对接志愿积分机制，提升用户活跃度50%。
项目经历：
- 在线图书馆管理系统（全栈AI项目/毕业设计），2025-12 至 2026-06：全栈独立开发，支持三端角色登录，涵盖图书管理、借阅归还、逾期处理、AI大模型集成等20+功能模块，设计8张核心数据库表；AI大模型集成智能推荐模块，对接大模型API，设计推荐Prompt模板，动态注入用户借阅历史与书籍标签；ECharts可视化借阅趋势大屏；熟练运用Cursor、Codex、WorkBuddy、Trae等AI Agent工具辅助开发，研发效率提升约80%。
专业技能：
- 项目管理：项目进度与里程碑管控，风险识别与闭环管理，SOP流程搭建与文档编写。
- 技术能力：Python，Java，API接口调用，提示词工程，熟练使用Cursor、Codex、WorkBuddy、Trae等AI编程工具进行Vibe Coding开发。
- 会议组织：会议组织与纪要归档，周报/月报输出，项目文件管理，待办事项跟踪。
- 沟通协调：跨部门协作（产品/研发/运营/公益），高校合作方对接，干系人沟通与定期同步。
- 办公工具：飞书全家桶，WPS Office，Draw.io以及WorkBuddy、Trae Work、豆包等主流AI办公工具。
- 语言能力：粤语（精通），普通话（母语），英语（可阅读技术文档），日语（可阅读技术文档）。`;

// 自进化循环优化协议：只在「自进化循环优化」预设每轮带入，避免污染其他优化预设。
// 设计目标：清晰（结构化、可执行的规则）+ 稳定（强约束输出格式、降温度、明确版本号定位）。
const SELF_EVOLVE_PROTOCOL = `【自进化循环优化协议（本任务专用，每轮由用户输入带入）】
你的任务：让岗位评分筛选提示词自我进化——每轮在现有版本上「新增 10 个加分条目 + 10 个减分条目」，并用最近 1000 条真实投递数据做回测、删掉没命中的，循环往复。

★★ 核心澄清（务必遵守）★★
「加 10 个」= 新增 10 条评分条目（条目数量），绝对不是把分值设为 +10。
【分值上限（仅约束自进化每轮「新增」的条目，不动用户原稿）】本轮由你新生成的条目（带 // [vN] 标记）分值必须严格受控：|分值| ≤ 20。
即：加分新条目分值落在 +1 ~ +20；减分新条目分值落在 -1 ~ -20。
严禁出现「10 个条目全部写 +10 / -10」这类偷懒写法，也严禁在普通轮次给新条目超过 ±20 的分值。
⚠️ 此上限【只针对你新增的条目】，用户原始手写的提示词条目（无 // [vN] 标记）不受此约束——无论其原值是 -300、-1000 还是其他，一律保留不动，回测清理时也不得收窄、改写或删除其分值。
【漏洞例外（唯一可突破 ±20 的情形）】只有当回测发现「漏洞」时才允许突破：某类岗位特征在 1000 条数据中【持续、反复】命中，导致系统一直给候选人投递明显不符合其背景的岗位（如长期推非目标城市/方向、与红线擦边的岗位），且 ±20 以内扣分拦不住时，才可把对应条目升级为 -1000 硬性红线（与既有红线同级的绝对排除）。升级前必须在回测报告写清：漏洞描述 + 持续投递不符岗位的证据 + 为何 ±20 不足。无明确漏洞证据不得自行升到 -1000。
【只增不删（最高优先级，违反即失败）】本次任务对用户草稿的核心约束是：用户原稿【只能在其基础上「新增」条目，绝对禁止删除、改写、合并、去重、重排其中的任何内容】。
- 用户原稿 = 草稿中所有「不带 // [vN] 标记」的内容（章节标题、表格、表格行、列表、条目、措辞、标点、换行）——一个字、一行、一个标点都不得改动或删除。
- 你被允许的唯一操作：在「加分项规则表」和「扣分项规则表」的【末尾】各追加新表格行（本轮新增的、带 [vN] 标记）。其余原样照搬。
- 严禁对用户原稿做"去重""合并相似条目""精简重复描述"之类的操作：即便你本轮新增的某条与用户原稿某条语义相近，也只处理你新增的那条（保留/删除带 [vN] 的），用户原稿那条永久保留不动。
- 严禁改写用户原稿任何表述（包括把表格重排、把多行并一行、把原句"优化"成你的措辞）。用户原稿即最终基底，你只是往里"追加"，不是"重写"。

【格式零改动】你输出的「完整提示词全文」代码块，必须以用户当前草稿为【逐字基底】：
- 草稿原有的 markdown 标题层级、表格结构、列表、换行、标点、措辞——一字不改、一行不并、不重新排版、不"优化"原句。
- 严禁将多行合并成一行（如把"# 标题"和正文压到同一行）、严禁改写用户原有任何表述、严禁调整表格列宽/顺序。
- 你只做一件事：在草稿对应表格（加分项规则表 / 扣分项规则表）的【末尾】追加本轮新增的表格行，其余原样照搬。

★★ 锁定段（绝对禁止删除 / 改写 / 重排，逐字原样保留）★★
用户草稿中的以下章节是给 BOSS 直聘自动评分用的【输出契约】，是铁律级内容，自进化过程【一个字都不能动】：
1. # 输出要求（及其全部子项，包括 Reason格式规范、Score规范、JSON 输出格式、negative/positive 数组结构）——必须原样保留，禁止省略、改写或换成其他说明。
2. # 待评分岗位（模板变量说明）（及其全部 {{card.xxx}} 模板变量，如 {{card.brandName}}/{{card.jobName}}/{{card.postDescription}} 等）——必须原样保留，禁止删除任何变量。
3. 草稿的所有其他章节标题（如 # 角色定义、# 核心铁律、# 求职画像、# 评分规则 等）也必须逐字保留，不得改写、合并、重命名或重排。
4. ❌ 严禁生成任何 AI 自创的文档框架标题（如 "# BOSS直聘岗位筛选评分系统（V1.0）"、新增的"## 一/二/三"编号章节等）。✅ 你的完整提示词必须以用户草稿的【第一行】作为代码块第一行，不新加任何外层包裹标题。
5. 严禁把用户的表格重写成列表、把列表重写成表格，或把用户的「评分规则」章节整体改写成"系统设计文档"。

一、条目来源
- 所有新增条目必须基于【候选人简历】真实背景挖掘，不得编造简历外的技能/经历/维度。
- 加分维度参考（从简历优势取）：AI产品/大模型项目、项目管理、跨部门统筹、公益项目、全栈开发、提示词工程、双语(粤/普)沟通、高校合作对接等。
- 减分维度参考（简历明显缺失或弱匹配的硬性要求）：纯后端深度 coding、强销售指标(KPI)、特定证书(如PMP/CPA)、驻地偏远等。

二、条目写法与版本标记（必须镜像用户草稿的现有写法）
- 先观察用户草稿用的是什么写法，新增条目必须采用【完全相同】的风格：
  · 若草稿用「markdown 表格」（含 | 列 | 分隔符）：新增条目作为【新的一行表格行】插入到对应表格的末尾（加分进加分表格、减分进减分表格），列结构与原有行完全一致。
  · 若草稿用「列表/箭头」写法：按同样缩进与符号追加为列表项。
- 版本标记统一写在新增条目末尾，用注释形式 // [vN]（放在表格行最后一列、或列表项行尾均可），确保不破坏表格分隔符、不影响解析。
  表格写法示例（新增一行，标 [v1]，列结构与上表一致）：
  | 擦边岗位要求交押金/培训费 | -18 | JD要求交押金或培训费 // [v1] |
  列表/箭头写法示例：
  具备 AI 产品/大模型项目经验  →  +15  // [v1]
- N 为当前轮次：首轮 v1、第二轮 v2、第三轮 v3……依次递增。
- 上一轮新增的条目已在当前提示词草稿中，标记为其当时的版本号（如 [v1]）。

三、回测清理（每轮必做，且【严格只针对你此前某轮自己新增的、带 // [vN] 标记的条目】）
0. 范围锁定：回测清理的对象【只能是你自己加的、带 [vN] 标记的条目】。用户原稿条目（无 [vN] 标记）一律不在清理范围内——不删、不改、不合并、不去重。即使用户原稿与某 [vN] 条目语义重复，也只动 [vN] 那条，用户原稿永久保留。
1. 在当前草稿里找出版本号最大的那批标记条目（即上一轮新增的，如当前最大是 v2，则针对 [v2]）。
2. 用【最近 1000 条投递数据】逐条评估它们的真实表现：
   - 数据中几乎没出现对应岗位特征/筛除原因、也从未产生过评分记录 → 删除；
   - 数据中出现过对应特征、或产生过评分记录 → 保留。
3. 只增删上一轮那批 [vN] 条目，不改动用户原稿、也不改动更早轮次已保留的 [vN] 条目（除非用户明确要求）。

四、输出格式（严格遵守，缺一不可）
1. 第一行写明：当前轮次 = vN（N 为本轮版本号）。
2. 「回测报告」：用表格列出上一轮每个条目的【出现频率估计 / 保留或删除 / 简短理由】（首轮写「无（首轮）」）。
3. 简短的改动说明。
4. 回复末尾用独立 \`\`\` 代码块给出「修改后的完整提示词全文」，必须包含全部条目及其版本标记，可被程序直接抽取用于下一轮。`;

/**
 * 从 AI 回复中抽取 markdown 代码块作为「最新一版提示词」。
 * 优先匹配未指定语言的 ```...```，其次匹配 ```text/...``` 等带语言的。
 * 抽取失败返回 null（表示 AI 没有给出可被下一轮迭代引用的代码块）。
 */
function extractPromptBlock(text: string): string | null {
  // 1) 优先匹配纯 ```...```（无语言标记）
  const plain = text.match(/```\n?([\s\S]+?)\n?```/);
  if (plain) return plain[1].trim();
  // 2) 兜底匹配带语言标记的（如 ```markdown ... ```）
  const lang = text.match(/```[a-zA-Z][a-zA-Z0-9_-]*\n([\s\S]+?)\n```/);
  if (lang) return lang[1].trim();
  return null;
}

/**
 * AI 数据分析助手（MVP，非流式）
 * - AI 接口由用户在前端「AI 接口配置」面板自选：科大讯飞星火 / agnes / 自定义
 *   （配置存 localStorage，请求经 dev server 的 /ai-proxy 中继绕开跨域，见 src/lib/aiProvider.ts）
 * - 把当前数据集统计摘要注入系统提示词，让模型能基于真实投递数据回答
 * - 支持预设提示词一键发送，支持提示词优化模式
 */
export default function AIChat({ logs, standalone = false }: { logs: DeliveryLog[]; standalone?: boolean }) {
  // 两个模式各自维护独立的对话历史，切换模式时互不干扰、各自保留上一轮对话
  const [dataMessages, setDataMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      content:
        '你好，我是你的投递数据分析助手 🤖\n可以问我：\n• 我投递最多的岗位类型是什么？\n• 整体成功率怎么样？\n• 主要被什么原因筛掉？\n• 给我一些求职建议\n\n也可以点击下方的「优化提示词」，让我帮你打磨岗位筛选或 AI 评分提示词。',
    },
  ]);
  const [optimizeMessages, setOptimizeMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      content:
        '你好，我是提示词优化助手 ✨\n把你的提示词粘贴到下方输入框，点击「优化提示词」开始。\n\n支持多轮迭代：你可以基于我给的版本继续提修改意见（如「把应届毕业生改为 +10 分」），我会基于上一版调整，上下文不丢失。',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState<ChatMode>('data');
  // 优化模式专有：当前正在迭代的「提示词草稿」，作为多轮迭代的稳定上下文锚点
  const [promptDraft, setPromptDraft] = useState<string>('');
  // 草稿卡片是否展开（默认展开，方便用户直接看到完整当前版本；可手动收起）
  const [draftExpanded, setDraftExpanded] = useState(true);
  // 复制成功反馈
  const [copied, setCopied] = useState(false);
  // 自动重试提示（服务端偶发 5xx 时显示）
  const [retryHint, setRetryHint] = useState('');
  // 保存上一次发送的文本，便于报错后「一键重试」（无需重新输入）
  const [lastText, setLastText] = useState('');
  // （参数说明折叠区已搬到「AI 接口配置」模态框里）
  const scrollRef = useRef<HTMLDivElement>(null);

  // 【AI 接口配置】当前生效的供应商配置（可在面板里随时切换，localStorage 持久化）
  const [aiSettings, setAiSettings] = useState<AISettings>(() => loadAISettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const activeCfg = getActiveConfig(aiSettings);
  const providerLabel = getProviderLabel(aiSettings.active);

  // 【调试中心参数面板】照讯飞 API 调试中心的布局，参数可实时调，每次发请求生效
  // maxTokens 上限跟当前 active provider+model 走（精确到 model 级别）
  const maxTokensLimit = getModelMaxTokens(aiSettings.active, activeCfg.model);
  const [maxTokens, setMaxTokens] = useState(maxTokensLimit);
  // 切换 provider 或修改 model 后，maxTokens 超过新上限就 clamp 下来
  useEffect(() => {
    if (maxTokens > maxTokensLimit) setMaxTokens(maxTokensLimit);
  }, [maxTokensLimit, maxTokens]);
  const [topK, setTopK] = useState(4);              // 灵活度（top-k）
  const [temperature, setTemperature] = useState(1); // 随机性
  const [multiTurn, setMultiTurn] = useState(true); // 多轮对话：关掉则不发送历史（单轮测试用）

  // 面板保存 / 其他标签页改配置时同步过来
  useEffect(() => {
    const sync = () => setAiSettings(loadAISettings());
    window.addEventListener(AI_SETTINGS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(AI_SETTINGS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // 启动时从本地配置文件（.ai-config.json）恢复配置：
  // 覆盖「清了浏览器缓存 / 换了端口 / 换了浏览器 / 用 Electron 打开」等本地存储为空的场景
  useEffect(() => {
    let alive = true;
    void syncAISettingsFromServer().then((restored) => {
      if (alive && restored) setAiSettings(restored);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 当前模式对应的对话历史（仅用于 UI 渲染；sendMessage 内部按 sendMode 参数独立取数，
  // 避免 handlePreset 里 setMode 异步未生效时取错数组）
  const messages = mode === 'optimize' ? optimizeMessages : dataMessages;

  const presets: PresetPrompt[] = useMemo(
    () => [
      {
        label: '投递成功率',
        text: '分析我的整体投递成功率，并给出简要结论。',
        icon: <BarChart3 className="w-3.5 h-3.5" />,
        mode: 'data',
      },
      {
        label: '最多岗位类型',
        text: '我投递最多的岗位类型是什么？请列出前三名并简单分析。',
        icon: <Target className="w-3.5 h-3.5" />,
        mode: 'data',
      },
      {
        label: '主要筛除原因',
        text: '主要被什么原因筛掉？请按出现频率排序并给出改进建议。',
        icon: <Filter className="w-3.5 h-3.5" />,
        mode: 'data',
      },
      {
        label: '求职建议',
        text: '基于以上数据，给我一些针对性的求职建议。',
        icon: <Lightbulb className="w-3.5 h-3.5" />,
        mode: 'data',
      },
      {
        label: '优化提示词',
        text: '',
        icon: <Wand2 className="w-3.5 h-3.5" />,
        mode: 'optimize',
      },
      {
        label: '按数据生成提示词',
        text: '',
        icon: <Database className="w-3.5 h-3.5" />,
        mode: 'optimize',
        autoGenerate: true,
      },
      {
        label: '自进化循环优化',
        text: '',
        icon: <RefreshCw className="w-3.5 h-3.5" />,
        mode: 'optimize',
        selfEvolve: true,
      },
      {
        label: '排查提示词',
        text: '',
        icon: <Search className="w-3.5 h-3.5" />,
        mode: 'optimize',
        audit: true,
      },
    ],
    []
  );

  // 最近 1000 条真实投递原始数据（精简），供 AI 基于真实数据回答/优化
  const recentDataContext = useMemo(() => {
    if (!logs.length) return '';
    const sorted = [...logs].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    const recent = sorted.slice(0, 1000);
    const lines = recent.map((l, i) => {
      const parts = [
        `岗位=${l.jobTitle || '-'}`,
        `公司=${l.companyName || '-'}`,
        `状态=${l.status}`,
        `分类=${l.jobCategory || '未分类'}`,
      ];
      if (l.status !== 'success') parts.push(`筛除原因=${l.filterStateName || '-'}`);
      return `${i + 1}. ${parts.join(' | ')}`;
    });
    return `【最近 ${recent.length} 条投递原始数据（按时间倒序，精简）】\n${lines.join('\n')}`;
  }, [logs]);

  // 最近 2000 条评分数据的「实际命中词表」（去重聚合 + 计数），用于「排查提示词」预设：
  // 找出当前草稿里哪些加分/减分项在真实评分中一次都未被命中。
  const auditHitContext = useMemo(() => {
    if (!logs.length) return '';
    const sorted = [...logs].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    const recent = sorted.slice(0, 2000);
    const posMap = new Map<string, number>(); // 加分项 reason → 命中次数
    const negMap = new Map<string, number>(); // 减分项 reason → 命中次数
    let scoredCount = 0;

    const cleanReason = (line: string) => {
      const r = line
        .replace(/\s*[（(]\s*\/?\s*\d+\s*分\s*[）)]\s*$/, '')
        .replace(/\/(\d+)分$/, '')
        .trim();
      return r.length >= 2 ? r : '';
    };

    for (const l of recent) {
      const msg = l.aiScoring?.message;
      if (!msg || !msg.includes('分数') || !msg.includes('消极')) continue;
      scoredCount++;
      const neg = msg.match(/消极:\n([\s\S]*?)(?=\n积极:|$)/);
      if (neg) {
        neg[1].split('\n').map((s) => s.trim()).filter(Boolean).forEach((line) => {
          const reason = cleanReason(line);
          if (reason) negMap.set(reason, (negMap.get(reason) || 0) + 1);
        });
      }
      const pos = msg.match(/积极:\n([\s\S]*)$/);
      if (pos) {
        pos[1].split('\n').map((s) => s.trim()).filter(Boolean).forEach((line) => {
          const reason = cleanReason(line);
          if (reason) posMap.set(reason, (posMap.get(reason) || 0) + 1);
        });
      }
    }

    const fmt = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}（${v}次）`).join('\n') || '（空：该方向在数据中从未被命中）';

    return (
      `【最近 ${recent.length} 条投递中，含 AI 评分明细的记录共 ${scoredCount} 条】\n` +
      `以下是这些记录里【实际命中过】的加分项 / 减分项词表（已去重并按命中次数降序），用于排查你草稿里"从未被使用"的条目：\n\n` +
      `## 实际命中过的加分项词表\n${fmt(posMap)}\n\n` +
      `## 实际命中过的减分项词表\n${fmt(negMap)}\n\n` +
      `说明：若草稿中某条加分/减分规则的语义在上述词表中完全找不到任何对应命中，则该条目在本次 2000 条数据中"0 次使用"。`
    );
  }, [logs]);

  // 构造数据摘要（系统 prompt 上下文）
  const dataSystemPrompt = useMemo(() => {
    const total = logs.length;
    const success = logs.filter((l) => l.status === 'success').length;
    const screened = logs.filter((l) => l.status === 'screened').length;
    const failed = logs.filter((l) => l.status === 'failed').length;
    const pending = logs.filter((l) => l.status === 'pending').length;
    const rate = total ? Math.round((success / total) * 100) : 0;

    const catCount: Record<string, number> = {};
    logs.forEach((l) => {
      const c = l.jobCategory || '未分类';
      catCount[c] = (catCount[c] || 0) + 1;
    });
    const topCats = Object.entries(catCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const reasonCount: Record<string, number> = {};
    logs
      .filter((l) => l.status !== 'success')
      .forEach((l) => {
        const r = l.filterStateName || '其他原因';
        reasonCount[r] = (reasonCount[r] || 0) + 1;
      });
    const topReasons = Object.entries(reasonCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    return `你是「BOSS 直聘投递数据分析助手」。以下是当前数据集的统计摘要（基于用户本地投递记录自动生成，不要编造超出此范围的数字）：

【总体】
- 总投递记录：${total} 条
- 投递成功：${success} 条（成功率 ${rate}%）
- 被系统/AI 筛除：${screened + failed} 条
- 待处理：${pending} 条

【岗位分类 Top】
${topCats.map(([c, n], i) => `${i + 1}. ${c}：${n} 条`).join('\n')}

【主要筛除原因 Top】
${topReasons.map(([r, n], i) => `${i + 1}. ${r}：${n} 条`).join('\n')}

    用户会用中文提问关于投递情况的问题，请基于以上统计与原始数据用简洁中文回答，并可以在合适时给出求职建议。

${recentDataContext}`;
  }, [logs, recentDataContext]);

  const optimizeSystemPrompt = useMemo(
    () =>
      `你是一位资深的提示词工程专家，专门帮助用户优化用于 BOSS 直聘岗位筛选、AI 评分、简历匹配等场景的提示词。

请按以下步骤优化用户提供的提示词：
1. 诊断当前提示词的问题（冗余、歧义、缺少约束、格式问题等）
2. 给出优化后的完整提示词
3. 简要说明改动点与使用建议

要求：
- 保持原意不变，但表达更精准、结构化
- 如果是评分/筛选类提示词，强调「扣分永远扣分、加分永远加分」「红线优先」「同义词命中」等原则
- 输出使用 Markdown 格式，便于阅读
- 不要编造用户没提供的内容

【多轮迭代的硬性格式要求（非常重要）】
这是一个支持多轮对话的优化助手，用户可能会基于你上一轮的输出继续提修改意见（例如「把应届毕业生改为 +10 分」「删掉第三节」等）。
为保证下一轮你仍然知道「上一版提示词长什么样」，请严格遵守以下输出格式：
- 每次回复必须在末尾用一个独立的 Markdown 代码块（用三个反引号包裹，不指定语言）给出「当前最新一版完整提示词」。
- 这个代码块必须是可以被程序自动抽取并作为下一轮迭代输入的「纯文本提示词」，不要在代码块内加任何前言后语、注释或 Markdown 语法。
- 你的诊断、说明、改动理由等解释性内容放在代码块之外的正常 Markdown 区域。
- 评分/筛选类提示词的所有分值调整，必须在代码块中真实体现，不要只在解释里说而忘了改代码块。

【关于筛选项的合理性】
用户原提示词中出现「活跃度筛除」「地址筛选」这类筛选项目是合理且必要的，它们属于正常的岗位过滤维度，优化时不要将其当作冗余或问题而误删、误改，保持原样即可。

【根据投递数据调整分值（核心任务）】
下方附上了用户最近 1000 条真实投递数据。优化评分/筛选类提示词时，必须基于这些数据对「加分项」和「扣分项」的权重分值进行数据驱动的微调：
- 若某加分项命中后，对应岗位实际投递成功率偏低或被大量筛除，应适当下调其分值；
- 若某扣分项触发频率过高导致误杀（本应合适的岗位被排除），应适当下调其扣分幅度；
- 若某加分项命中后成功率高，可适当上调其分值；
- 调整须有数据依据，并在改动说明中引用数据佐证（如命中该项的岗位成功/筛除数量）。

【红线约束（绝对不可改动）】
${AI_RED_LINE_DEDUCTION} 分是硬性排除红线（对应大小周/单休、CET-4/6 证书要求、英语工作语言、实习生岗位、工作地点非深圳等绝对不可接受的岗位），属于不可逾越的硬约束。
⚠️ 无论数据表现如何，绝对不能修改、下调、削弱或删除 ${AI_RED_LINE_DEDUCTION} 这个分值，也不得用更小的扣分或条件放宽来替代它。这是不可触碰的红线，分值必须保持 ${AI_RED_LINE_DEDUCTION} 原值。

【结尾必须输出：筛选分数线建议】
在所有优化说明之后，必须基于上方真实投递数据，给出一个明确的「筛选分数线」结论，格式如：
> 建议筛选分数线：仅投递评分 ≥ X 分的岗位；低于 X 分的岗位判定为不匹配、不予投递。
要求：
- 该分数线须有数据支撑（如：X 分以上岗位的成功率、被筛除比例明显更优，或结合加分/扣分权重推算出合理阈值），并简要说明推导逻辑；
- 若数据不足以支撑精确分数线，可给出区间建议（如「建议门槛在 X~Y 分之间，先用 X 分试运行再根据漏放/误杀比例微调」）；
- 任何岗位一旦命中 ${AI_RED_LINE_DEDUCTION} 红线，无论总分多少一律排除，分数线建议不得覆盖该硬约束。

【候选人简历（固定素材，自进化优化专用）】
以下是求职者（用户）的真实简历文本。所有「加分项目 / 减分项目」的新增都必须基于这份简历的真实背景挖掘，不得编造简历中不存在的技能、经历或维度。自进化循环优化时，优先从简历里提取可加分因子（如 AI产品/大模型项目、项目管理、跨部门统筹、公益项目、全栈开发、提示词工程等）与可减分因子（如简历中明显缺失的硬性要求）。
${RESUME_TEXT}

【自进化循环优化协议】当用户使用「自进化循环优化」预设时，详细的循环协议（版本标记、回测清理、输出格式等）会由该预设的每轮输入带入，无需在此赘述。

【用户最近的真实投递数据（最近 1000 条，按时间倒序，精简）】
为让优化更贴合真实场景，请结合以下数据中高频出现的筛除原因、岗位类型分布、薪资结构等特征来调整提示词（注意遵守上方红线约束）。
${recentDataContext}`,
    [recentDataContext]
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // 切回 data 模式时清空草稿（草稿是优化模式专有的状态，data 模式下没有意义，避免误用）
  useEffect(() => {
    if (mode === 'data' && promptDraft) {
      setPromptDraft('');
      setDraftExpanded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function handlePreset(preset: PresetPrompt) {
    if (loading) return;
    setMode(preset.mode);

    if (preset.mode === 'optimize') {
      if (preset.autoGenerate) {
        // 以「当前提示词草稿」(promptDraft) 为起点 + 最近 1000 份真实投递数据，数据驱动地生成/优化评分筛选提示词。
        // 草稿为空时要求先粘贴起点草稿（与自进化/排查预设一致，避免凭空从零生成）；
        // 草稿手动拼进指令 + skipDraft=true，避免 sendMessage 重复注入（与「排查提示词」预设同构）。
        const baseDraft = promptDraft.trim();
        if (!baseDraft) {
          setInput(
            '请先在上方「当前草稿」卡片里粘贴你的起点提示词（运行过其他优化后它会自动出现），然后再次点击「按数据生成提示词」。' +
              '我会基于它 + 最近 1000 份真实投递数据来生成/优化，而不是凭空从零写。',
          );
          return;
        }
        await sendMessage(
          `请以你【当前提示词草稿】（下方代码块）为起点，结合系统提示词里的「最近 1000 份真实投递数据」，数据驱动地优化/重生成一套完整的岗位评分筛选提示词：

\`\`\`
${baseDraft}
\`\`\`

要求：
1. 保留草稿完整结构：章节、表格、输出格式、{{card.xxx}} 变量、红线 ${AI_RED_LINE_DEDUCTION} 等一律原样保留，不要改写、重排或自创外层框架；
2. 仅做「数据驱动」微调：命中后成功率低的加分项适度下调分值，误杀率高的扣分项适度减小扣分，命中后成功率高的加分项适度上调；每条调整须在改动说明里引用数据佐证（命中数/成功数/筛除数）；
3. 必须包含：加分项规则表、扣分项规则表、红线约束（${AI_RED_LINE_DEDUCTION} 硬排除）、以及基于数据推导的「筛选分数线建议」；
4. 回复末尾必须用独立代码块给出【修改后的完整提示词】全文（可被程序抽取用于下一轮迭代），代码块内不要加任何前言后语。
不要凭空重写、不要删除草稿原有内容。`,
          'optimize',
          true, // 草稿已拼进上方指令，skipDraft 避免重复注入
          0.3, // 降温度让输出更稳定
        );
        setInput('');
        return;
      }
      if (preset.selfEvolve) {
        // 自进化循环优化（用专属协议常量 SELF_EVOLVE_PROTOCOL，并降温度让输出更稳定）：
        // - 首轮：以用户手动输入的提示词草稿为起点，新增 10 加分条目 / 10 减分条目，打 [v1]
        // - 后续轮（有草稿）：回测上一轮新增条目、清理无评分记录的、再新增 10+10 打 [v(N+1)]
        // 草稿手动拼进指令 + skipDraft=true，避免依赖 setPromptDraft 的闭包时序（与「排查提示词」预设同构）。
        const SELF_TEMP = 0.3;
        const userDraft = input.trim();
        const baseDraft = userDraft || promptDraft.trim();
        if (!baseDraft) {
          // 既没有输入框内容也没有草稿：提示用户先输入起点草稿
          setInput('请在这里粘贴你的提示词草稿，然后再次点击「自进化循环优化」开始第 1 轮。');
        } else if (userDraft) {
          // 首轮：基于用户输入的草稿（手动拼进指令）+ skipDraft=true，避开 setPromptDraft 的闭包时序
          await sendMessage(
            `${SELF_EVOLVE_PROTOCOL}\n\n【本轮任务：第 1 轮】\n` +
              '用户已在输入框中手动输入一版提示词草稿（下方代码块）。请基于该草稿，结合【候选人简历】与【最近 1000 条投递数据】进行第一轮优化：\n' +
              '- 遵守协议「只增不删」铁律：草稿任何原有内容（章节/表格行/条目/措辞/标点）一律原样保留，你唯一可做的是在「加分项规则表」「扣分项规则表」末尾各追加新行；【禁止删除、改写、合并、去重用户原稿的任何内容】（原稿不受 ±20 上限约束）。\n' +
              '- ⚠️ 草稿里的「# 输出要求」（JSON 输出格式 + Reason/Score 规范）与「# 待评分岗位（模板变量说明）」（全部 {{card.xxx}} 变量）是铁律级锁定段，必须【逐字原样保留】，一个字都不能删、不能改写、不能重排；严禁自创"V1.0系统"之类的外层标题框架，完整提示词必须以草稿第一行开头。\n' +
              '- 按协议第一、二、四条新增 10 个加分条目 + 10 个减分条目（作为新表格行插入对应表格末尾），全部标记 // [v1]（新增条目受 ±20 上限约束）；\n' +
              '- 给出筛选分数线建议；\n' +
              '代码块外附「本轮新增清单（v1）」。\n\n' +
              `【用户草稿】\n\`\`\`\n${userDraft}\n\`\`\``,
            'optimize',
            true, // 草稿已拼进上方指令，skipDraft 避免 sendMessage 重复注入
            SELF_TEMP,
          );
          // sendMessage 已异步发起，setPromptDraft 仅用于 UI 卡片同步，不影响本次请求
          setPromptDraft(userDraft);
          setInput('');
        } else {
          // 后续轮：基于现有 promptDraft 继续进化（同样手动拼进指令 + skipDraft=true）
          await sendMessage(
            `${SELF_EVOLVE_PROTOCOL}\n\n【本轮任务：下一轮】\n` +
              '当前提示词草稿（下方代码块）中带 // [vN] 标记的条目是上一轮新增的（N = 草稿里出现的最大版本号）。\n' +
              '请严格按协议第三、四条：对上一轮那批 [vN] 条目做回测清理（仅清理你之前加的带标记条目，用户原稿一个字不动），再新增 10 个加分条目 + 10 个减分条目，标记 // [v(N+1)]。\n' +
              '⚠️ 始终遵守协议「只增不删」与「锁定段」铁律：草稿里的所有原有内容（含「# 输出要求」「# 待评分岗位（模板变量说明）」及全部 {{card.xxx}} 变量、各章节标题）必须逐字保留，禁止删除/改写/合并/重排用户原稿任何内容，严禁自创外层标题框架，完整提示词必须以草稿第一行开头。\n\n' +
              `【当前草稿】\n\`\`\`\n${baseDraft}\n\`\`\``,
            'optimize',
            true, // 草稿已拼进上方指令，skipDraft 避免 sendMessage 重复注入
            SELF_TEMP,
          );
          setInput('');
        }
        return;
      }
      if (preset.audit) {
        // 排查提示词：基于最近 2000 条评分数据的实际命中词表，找出草稿里从未被命中的加分/减分项。
        // 只输出排查报告、不修改草稿。草稿直接拼进指令（skipDraft=true），避免依赖 setPromptDraft 的闭包时序。
        const userDraft = input.trim();
        const baseDraft = userDraft || promptDraft.trim();
        if (!baseDraft) {
          setInput('请先粘贴你的提示词草稿（或确保「当前草稿」里已有内容），然后再次点击「排查提示词」。');
          return;
        }
        if (!auditHitContext) {
          setInput('暂无投递评分数据，无法排查。请先运行 BOSS 自动投递、积累 AI 评分记录后再试。');
          return;
        }
        // 若用户是这次手动粘贴的草稿，同步到当前草稿卡片，方便后续操作
        if (userDraft) setPromptDraft(userDraft);
        await sendMessage(
          `【排查对象：当前提示词草稿】\n\`\`\`\n${baseDraft}\n\`\`\`\n\n` +
            '请基于上方提示词与下方【最近 2000 条评分数据的实际命中词表】，做一次「从未使用项排查」：\n' +
            '1. 逐条读取草稿里的「加分项规则表」每条规则（含其条件/关键词），判断它的语义是否在上述"实际命中过的加分项词表"中出现过至少 1 次；\n' +
            '2. 逐条读取草稿里的「减分项规则表」每条规则，判断它的语义是否在上述"实际命中过的减分项词表"中出现过至少 1 次；\n' +
            '3. 凡是语义在对应词表里【完全找不到任何对应命中】的规则，标记为「0 次使用 / 从未使用」。\n' +
            '4. 输出报告：\n' +
            '   - 「从未使用的加分项清单」：列出草稿中从未命中的加分规则（含原分值、判定理由）；\n' +
            '   - 「从未使用的减分项清单」：列出草稿中从未命中的减分规则（含原分值、判定理由）；\n' +
            '   - 对每条给出建议：可删除 / 暂时保留观察（说明原因）。\n' +
            '⚠️ 本次只做排查与建议，【不要修改、不要重写、不要删除】草稿里的任何内容，也不要新增条目。回复无需代码块。',
          'optimize',
          true, // skipDraft：草稿已拼进上方指令，不再由 sendMessage 重复注入
          0.3, // 排查用更低温度，输出更稳定
          auditHitContext, // 注入最近 2000 条实际命中词表
        );
        setInput('');
        return;
      }
      const current = input.trim();
      if (!current) {
        setInput('请帮我优化以下提示词：\n\n[在这里粘贴你的提示词]');
        return;
      }
      // 将当前输入框内容作为待优化的提示词直接发送
      await sendMessage(current, 'optimize');
      setInput('');
      return;
    }

    await sendMessage(preset.text, 'data');
  }

  async function sendMessage(
    text: string,
    sendMode: ChatMode,
    skipDraft = false,
    tempOverride?: number,
    extraContext?: string,
  ) {
    if (!text || loading) return;
    setError(null);
    setLastText(text);
    // 按 sendMode 取当前模式的对话历史与 setter。
    // 不依赖外部 mode state —— handlePreset 里 setMode 是异步的，紧接着调 sendMessage 时
    // mode 可能还没更新，直接用 mode 会取错数组。用 sendMode 参数最稳。
    const history = sendMode === 'optimize' ? optimizeMessages : dataMessages;
    const setHistory = sendMode === 'optimize' ? setOptimizeMessages : setDataMessages;
    const next: Msg[] = [...history, { role: 'user', content: text }];
    setHistory(next);
    setLoading(true);

    // 【多轮迭代的上下文锚点】
    // 优化模式下，如果存在「上一版提示词草稿」，把它作为显式上下文注入本轮 user message。
    // 这样 AI 拿到的是「完整当前草稿 + 你的修改意见」，而不是靠反推长篇 markdown 答案。
    let userContent = text;
    if (sendMode === 'optimize' && promptDraft.trim() && !skipDraft) {
      userContent = `【当前正在迭代的提示词（请基于这一版做修改）】
\`\`\`
${promptDraft}
\`\`\`

【用户的修改意见】
${text}

【要求】
- 仅按用户的修改意见调整，不要无故重写其他部分。
- 回复末尾必须用独立的 \`\`\` ... \`\`\` 代码块给出「修改后的完整提示词」全文，便于下一轮继续迭代。`;
    }

    // 发请求前先校验当前供应商配置是否填全，缺东西直接引导去配置面板
    const configError = validateConfig(aiSettings.active, aiSettings.providers[aiSettings.active]);
    if (configError) {
      setError(`${configError}。点右上角「接口设置」进行配置。`);
      setLoading(false);
      return;
    }

    try {
      // 多轮对话关闭时，不发送历史消息（用于单轮测试场景）
      const historyToSend = multiTurn ? next.slice(0, -1) : [];
      // 请求体所有重试共用
      const payload = JSON.stringify({
        model: activeCfg.model.trim() || 'lite',
        messages: [
          {
            role: 'system',
            content: sendMode === 'optimize' ? optimizeSystemPrompt : dataSystemPrompt,
          },
          // 附加上下文（如「排查提示词」预设注入的最近 2000 条实际命中词表）
          ...(extraContext ? [{ role: 'system' as const, content: extraContext }] : []),
          // 历史消息：剔除最后一条原始 user 消息，用注入草稿后的 userContent 替代，
          // 避免 API 同时看到「裸意见」和「意见+草稿」产生混淆
          ...historyToSend.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content: userContent },
        ],
        max_tokens: maxTokens,
        temperature: tempOverride ?? temperature,
        top_k: topK,
      });

      // 服务端偶发 5xx（星火已实测：同一请求有时 500、有时 8 秒后 200），
      // 这里做自动重试：5xx / 网络异常重试，4xx（鉴权/余额/限流）不重试直接报错
      const MAX_RETRIES = 3;
      let res: Response | null = null;
      let finalErr: { status?: number; message: string } | null = null;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const r = await postChat(payload, aiSettings);
          if (r.ok) {
            res = r;
            break;
          }
          // 4xx 客户端错误（401/402/403/429 等）不重试
          if (r.status < 500) {
            const errorText = await r.text().catch(() => '');
            let errorMessage = `API ${r.status}`;
            try {
              const parsed = JSON.parse(errorText);
              const apiMsg = parsed?.error?.message || parsed?.message || '';
              if (apiMsg) errorMessage = apiMsg;
            } catch {
              /* ignore */
            }
            finalErr = { status: r.status, message: errorMessage };
            break;
          }
          // 5xx：记录，进入重试
          finalErr = { status: r.status, message: `API ${r.status}` };
        } catch (netErr) {
          // 网络异常（连接被重置、代理超时等）也重试
          finalErr = { status: 0, message: (netErr as Error).message || String(netErr) };
        }
        // 还有重试机会：显示提示，递增延迟（1s, 2s）
        if (attempt < MAX_RETRIES) {
          setRetryHint(
            `${providerLabel} 服务暂时繁忙（${finalErr.status || '网络异常'}），正在自动重试 ${attempt}/${MAX_RETRIES - 1}…`,
          );
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
      setRetryHint('');

      if (!res || !res.ok) {
        // 全部重试仍失败，向上抛出（交由下方 catch 友好提示）
        throw finalErr ?? { status: 0, message: '未知错误' };
      }
      const data = await res.json();
      const reply = data?.choices?.[0]?.message?.content || '（无回复）';
      // 优化模式下，自动从 AI 回复里抽取代码块作为「最新一版提示词草稿」，
      // 下次用户发修改意见时，sendMessage 会自动把它注入上下文。
      if (sendMode === 'optimize') {
        const block = extractPromptBlock(reply);
        if (block) {
          setPromptDraft(block);
        } else if (!promptDraft.trim()) {
          // 首次优化且 AI 没有给代码块：把用户原文当成草稿占位，避免下一轮完全丢上下文
          setPromptDraft(text);
        }
      }
      setHistory([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      const status = (e as { status?: number }).status ?? 0;
      const message = (e as Error).message || String(e);
      let friendly = `调用「${providerLabel}」失败：请确认在开发模式（npm run dev）下运行，并在右上角「接口设置」里检查地址是否正确。`;
      if (status === 402 || message.toLowerCase().includes('insufficient_balance')) {
        friendly = `${providerLabel} 账户余额不足（402）。请检查额度，或在「接口设置」里换一个免费接口（如自定义接入开源模型）。`;
      } else if (status === 401 || status === 403) {
        friendly = `${providerLabel} API Key 无效或没有权限，请在右上角「接口设置」里重新填写 Key。`;
      } else if (status === 429) {
        friendly = `${providerLabel} 请求过于频繁（429），请稍后再试。`;
      } else if (status >= 500) {
        friendly = `${providerLabel} 服务端异常，请稍后再试，或在「接口设置」里切换其他接口。`;
      }
      setError(`${friendly} 详情：${message}`);
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    await sendMessage(text, mode);
  }

  // 清除当前模式的所有对话历史（搬到模态框后，调试中心面板不再单独显示此按钮）
  function handleClearHistory() {
    if (!confirm('确定清除当前模式的所有对话历史？此操作不可恢复。')) return;
    if (mode === 'optimize') {
      setOptimizeMessages([
        {
          role: 'assistant',
          content:
            '你好，我是提示词优化助手 ✨\n把你的提示词粘贴到下方输入框，点击「优化提示词」开始。\n\n支持多轮迭代：你可以基于我给的版本继续提修改意见（如「把应届毕业生改为 +10 分」），我会基于上一版调整，上下文不丢失。',
        },
      ]);
      setPromptDraft('');
      setDraftExpanded(true);
    } else {
      setDataMessages([
        {
          role: 'assistant',
          content:
            '你好，我是你的投递数据分析助手 🤖\n可以问我：\n• 我投递最多的岗位类型是什么？\n• 整体成功率怎么样？\n• 主要被什么原因筛掉？\n• 给我一些求职建议\n\n也可以点击下方的「优化提示词」，让我帮你打磨岗位筛选或 AI 评分提示词。',
        },
      ]);
    }
  }

  return (
    <section className={`card ${standalone ? 'h-full flex flex-col p-6' : 'p-5 space-y-4'}`}>
      <div className="flex items-center justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {!standalone && (
            <>
              <Sparkles className="w-5 h-5 text-accent-500 flex-shrink-0" />
              <h3 className="text-base font-semibold text-warm-800 dark:text-warm-100 truncate">
                AI 数据分析助手
              </h3>
            </>
          )}
          {standalone && (
            <h2 className="text-lg font-semibold text-warm-800 dark:text-warm-100">
              AI 接口配置
            </h2>
          )}
          {/* 当前生效的 AI 接口，一眼可见 */}
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-accent-50 text-accent-700 border border-accent-200 dark:bg-accent-900/20 dark:text-accent-300 dark:border-accent-800 flex-shrink-0"
            title={`当前接口：${providerLabel}${activeCfg.model ? ` · ${activeCfg.model}` : ''}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse-soft" />
            {providerLabel}
            {activeCfg.model && <span className="opacity-60">· {activeCfg.model}</span>}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-warm-500 hover:text-accent-600 hover:bg-accent-50 dark:hover:bg-accent-900/20 transition-all"
            title="切换 / 配置 AI 接口（科大讯飞星火、agnes、自定义）"
          >
            <Settings2 className="w-3.5 h-3.5" />
            接口设置
          </button>
          {!standalone && (
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="text-xs px-2 py-1 rounded-lg text-warm-400 hover:text-warm-600 transition-colors"
            >
              {collapsed ? '展开' : '收起'}
            </button>
          )}
        </div>
      </div>

      {settingsOpen && (
        <AIProviderSettings
          onClose={() => setSettingsOpen(false)}
          maxTokens={maxTokens}
          setMaxTokens={setMaxTokens}
          topK={topK}
          setTopK={setTopK}
          temperature={temperature}
          setTemperature={setTemperature}
          multiTurn={multiTurn}
          setMultiTurn={setMultiTurn}
          onClearHistory={handleClearHistory}
          maxTokensLimit={maxTokensLimit}
          activeProviderId={aiSettings.active}
          activeModel={activeCfg.model}
        />
      )}

      {(!collapsed || standalone) && (
        <div className={standalone ? 'flex-1 min-h-0 flex flex-col' : 'space-y-4'}>
          {/* 调试中心面板已整体搬到「AI 接口配置」模态框，这里只剩聊天区 */}
          <div className={standalone ? 'flex flex-col flex-1 min-h-0 space-y-3' : 'flex flex-col space-y-3'}>
            <div
              ref={scrollRef}
              className="overflow-y-auto space-y-3 rounded-xl bg-warm-50/60 dark:bg-warm-900/40 p-3 flex-1 min-h-0"
            >
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-accent-500 text-white'
                        : 'bg-white text-warm-800 border border-warm-200 dark:bg-warm-900 dark:text-warm-100 dark:border-warm-800'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-white dark:bg-warm-900 border border-warm-200 dark:border-warm-800 px-3 py-2 text-sm text-warm-400 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {retryHint || (mode === 'optimize' ? '优化中…' : '分析中…')}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 min-w-0">{error}</span>
                {lastText && (
                  <button
                    onClick={() => {
                      setError(null);
                      void sendMessage(lastText, mode);
                    }}
                    className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-100 hover:bg-red-200 text-red-700 font-medium transition-colors"
                    title="用相同内容重新发送"
                  >
                    <RotateCcw className="w-3 h-3" />
                    重试
                  </button>
                )}
              </div>
            )}

            {/* 当前正在迭代的提示词草稿（仅在优化模式 + 有草稿时显示） */}
            {mode === 'optimize' && promptDraft.trim() && (
              <div className="rounded-xl border border-accent-200 dark:border-accent-800 bg-accent-50/60 dark:bg-accent-900/20 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-accent-200/60 dark:border-accent-800/60">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileText className="w-3.5 h-3.5 text-accent-600 dark:text-accent-400 flex-shrink-0" />
                    <span className="text-xs font-medium text-accent-700 dark:text-accent-300 flex-shrink-0">
                      当前草稿
                    </span>
                    <span className="text-[10px] text-warm-400 dark:text-warm-500 truncate">
                      {promptDraft.length} 字 · 下一条修改意见会基于此版本
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setDraftExpanded((v) => !v)}
                      className="text-xs px-2 py-1 rounded text-warm-500 hover:text-accent-600 hover:bg-accent-100/60 dark:hover:bg-accent-900/40 transition-colors"
                    >
                      {draftExpanded ? '收起' : '展开'}
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(promptDraft);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        } catch {
                          /* 忽略剪贴板权限错误 */
                        }
                      }}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-accent-700 dark:text-accent-300 hover:bg-accent-100/60 dark:hover:bg-accent-900/40 transition-colors"
                      title="复制当前草稿"
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? '已复制' : '复制'}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('确定要清空当前草稿并重新开始优化？历史对话会保留。')) {
                          setPromptDraft('');
                          setDraftExpanded(false);
                        }
                      }}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-warm-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title="清空草稿，重新优化一份新的"
                    >
                      <RotateCcw className="w-3 h-3" />
                      重置
                    </button>
                  </div>
                </div>
                <div
                  className={`px-3 py-2 text-[13px] leading-relaxed text-warm-700 dark:text-warm-300 font-mono whitespace-pre-wrap ${
                    draftExpanded ? 'max-h-[60vh] overflow-y-auto' : 'max-h-32 overflow-hidden'
                  }`}
                  title={draftExpanded ? undefined : '点击右上角「展开」查看完整内容'}
                >
                  {draftExpanded
                    ? promptDraft
                    : promptDraft.length > 240
                      ? `${promptDraft.slice(0, 240)}…`
                      : promptDraft}
                </div>
              </div>
            )}

            {/* 预设提示词 / 快捷指令 */}
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => {
                const isOptimize = preset.mode === 'optimize';
                const active = isOptimize && mode === 'optimize';
                return (
                  <button
                    key={preset.label}
                    onClick={() => handlePreset(preset)}
                    disabled={loading}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      isOptimize
                        ? active
                          ? 'bg-accent-500 text-white border-accent-500 shadow-md shadow-accent-500/20'
                          : 'bg-accent-50 text-accent-700 border-accent-200 hover:bg-accent-100 dark:bg-accent-900/20 dark:text-accent-300 dark:border-accent-800'
                        : 'bg-white text-warm-600 border-warm-200 hover:border-accent-300 hover:text-accent-600 dark:bg-warm-900 dark:text-warm-400 dark:border-warm-800'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={
                      preset.audit
                        ? '排查草稿里从未被命中的加分/减分项（基于最近 2000 条评分数据）'
                        : preset.mode === 'optimize'
                          ? '优化当前输入框里的提示词'
                          : preset.text
                    }
                  >
                    {preset.icon}
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className={`flex gap-2 ${standalone ? '' : ''}`}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={mode === 'optimize' ? 5 : 3}
                placeholder={mode === 'optimize' ? '粘贴你想优化的提示词，或点击「优化提示词」直接发送...\n支持多行，Enter 发送，Shift+Enter 换行' : '问我关于你的投递数据...\nEnter 发送，Shift+Enter 换行'}
                className="flex-1 px-4 py-2.5 rounded-lg border border-warm-200 dark:border-warm-800 bg-white dark:bg-warm-900 text-sm text-warm-800 dark:text-warm-100 outline-none focus:ring-2 focus:ring-accent-200 transition-shadow resize-y min-h-[3.5rem]"
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                className="btn btn--primary px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Send className="w-4 h-4" />
                发送
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
