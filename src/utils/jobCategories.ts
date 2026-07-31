/**
 * 岗位分类工具
 * 优先使用 MiMo 大模型分类结果（public/job-categories.json，由 scripts/classify-jobs.mjs 生成）
 * 回退到关键词正则规则（离线可用，未运行分类脚本时也能展示）。
 */

// 关键词正则规则（离线回退，保持原有 9 类体系）
export const CATEGORY_RULES: { keywords: RegExp[]; category: string; color: string }[] = [
  {
    category: '项目助理',
    color: '#06b6d4',
    keywords: [
      /项目助理/, /项目专员/, /项目管理员/,
      /项目管理/, /项目统筹/, /项目实施/,
      /项目协调/, /项目跟进/, /助理.*项目/,
      /项目经理/, /项目主管/, /项目开发/,
      /研发助理/, /总经理助理/, /经理助理/,
      /综合事务/, /经营管理助理/, /经营助理/,
      /档案管理/, /档案管理员/,
      /RPA助理/, /PMO专员/, /支付项目/,
      /总监助理/, /工程管理/, /开发助理/,
      /需求助理/, /图书管理/,
      /总经办/, /综合助理/, /咨询助理/,
      /登记员/, /窗口登记/,
      /部门助理/, /业务助理/, /办公室助理/,
      /内控助理/, /营销助理/, /支付专员/,
      /助理$/, /行政$/, /管理培训生/,
      /研发部门/,
      /办公室.*主任/, /综合行政/,
      /行政人资/, /行政综合/,
      /考勤/, /薪酬绩效/, /资产采管/,
      /知识产权/, /储备干部/,
      /专员$/,
      /行政助理/, /行政专员/, /行政主管/,
      /文员/, /秘书/, /前台/,
      /内勤/, /后勤/, /文秘/,
      /人事专员/, /人事助理/, /HR/,
      /招聘专员/, /招聘助理/, /猎头顾问/,
      /人力专员/, /人力资源/,
      /管培生/, /应届生/, /实习生/,
    ],
  },
  {
    category: '产品经理',
    color: '#a855f7',
    keywords: [
      /产品经理/, /产品助理/, /产品专员/,
      /产品负责人/, /产品总监/, /产品运营/,
      /产品设计/, /产品策划/, /产品主管/,
      /需求分析/, /产品需求/,
      /产品开发/, /精品开发/,
      /产品开发专员/, /产品开发助理/,
      /技术PM/, /业务分析师/, /BA-/,
      /酒店产品/, /小游戏产品/,
      /产品.*业务经理/,
    ],
  },
  {
    category: '平台运营',
    color: '#f97316',
    keywords: [
      /平台运营/, /新媒体运营/, /内容运营/,
      /用户运营/, /社群运营/, /活动运营/,
      /商家运营/, /品类运营/, /直播运营/,
      /短视频运营/, /小红书运营/, /公众号运营/,
      /电商运营/, /运营专员/, /运营助理/,
      /流量运营/, /渠道运营/, /数据运营/,
      /海外运营/, /增长运营/, /品牌运营/,
      /社区运营/, /营销策划/, /网络推广/,
      /SEO/, /SEM/,
      /信息流/, /广告优化/, /投放专员/,
      /投放优化/, /短剧投放/, /优化师/,
      /独立站/, /拼多多/, /亚马逊/,
      /选品专员/, /选品/, /跟单/,
      /跨境电商/, /跨境.*运营/,
      /舆情分析/, /GEO运营/, /交付专员/,
      /内容策划.*运营/, /运营管培生/,
      /云资源交付/, /云产品/, /内容审核/,
      /策略运营/, /网约车.*管理/,
      /带货主播/, /主播/, /电竞赛事/,
      /天猫运营/, /跨境店铺/,
      /运营/,
      /媒介/, /小说投放/, /投放/,
      /审核/, /用户增长/, /交付顾问/,
      /海外红人/, /业务支持/,
      /客服/, /售后.*客服/, /客户成功/,
      /投诉处理/, /客诉/,
      /行政运营/, /运营主管/, /运营经理/,
      /运营总监/,
    ],
  },
  {
    category: '人工智能',
    color: '#14b8a6',
    keywords: [
      /人工智能/, /算法工程/, /算法研究员/,
      /深度学习/, /机器学习/, /NLP/,
      /计算机视觉/, /自然语言处理/, /推荐系统/,
      /AI/, /大模型/, /AIGC/,
      /数据科学家/, /数据挖掘/, /知识图谱/,
      /强化学习/, /语音识别/, /图像识别/,
      /ai训练师/, /AI训练师/,
      /Ai模型/, /AGI落地/, /模型评测/,
      /标注/, /Ai专员/,
    ],
  },
  {
    category: '游戏策划',
    color: '#ec4899',
    keywords: [
      /游戏策划/, /游戏设计/, /关卡策划/,
      /数值策划/, /系统策划/, /剧情策划/,
      /战斗策划/, /文案策划/, /游戏制作/,
      /游戏执行策划/, /执行策划/,
      /游戏广告策划/, /游戏剧情/, /游戏商业化/,
      /游戏.*制作人/,
    ],
  },
  {
    category: '游戏运营',
    color: '#f43f5e',
    keywords: [
      /游戏运营/, /游戏活动/, /游戏用户运营/,
      /游戏社群/, /游戏推广/,
      /游戏测试/,
      /游戏性测试/, /游戏适配/, /电竞赛事助理/,
      /游戏.*测试/, /游戏PC性能/,
      /游戏功能测试/, /测试（游戏/,
      /初级测试.*游戏/, /游戏方向/,
      /三角洲测试/, /游戏短视频/,
    ],
  },
  {
    category: '销售',
    color: '#22c55e',
    keywords: [
      /销售/, /客户经理/, /商务经理/,
      /商务拓展/, /市场推广/, /市场营销/,
      /渠道经理/, /渠道拓展/, /BD经理/,
      /大客户/, /销售代表/, /销售专员/,
      /销售主管/, /销售总监/, /销售经理/,
      /地推/, /陌拜/, /业务拓展/,
      /电话销售/, /销售顾问/, /客户代表/,
      /售前/, /售后/, /门店/, /零售/,
      /营业员/, /导购/, /外贸/, /跨境.*销售/,
      /客户成功/, /招商/, /加盟/,
      /代理商/, /分销/,
      /市场经理/, /市场主管/, /市场专员/,
      /品牌推广/, /活动策划.*市场/,
      /采购/, /供应链/, /采购经理/,
      /供应商管理/,
      /商务助理/, /商务专员/,
      /交付经理/,
    ],
  },
  {
    category: '数据处理',
    color: '#8b5cf6',
    keywords: [
      /大数据/, /数据分析/, /数据处理/,
      /数据工程/, /数据仓库/, /数据开发/,
      /ETL/, /BI工程师/, /BI开发/, /BI分析/,
      /数据治理/, /数据管理/, /数据架构/,
      /数据产品/, /数据运营.*数据/, /数据支持/,
      /数仓/, /数据采集/, /数据标注/,
      /数据专员/, /数据助理/, /数据.*专员/,
      /分析师/, /经分/, /经营分析/, /督控/,
      /财务/, /会计/, /出纳/,
      /审计/, /统计/, /核算/,
      /税务/, /会计助理/, /财务专员/,
    ],
  },
  {
    category: '技术研发',
    color: '#3b82f6',
    keywords: [
      /架构师/, /技术总监/, /CTO/,
      /研发经理/, /技术经理/, /技术负责人/,
      /技术主管/, /研发主管/, /技术VP/,
      /前端/, /后端/, /全栈/, /客户端/,
      /iOS/, /Android/, /移动端/, /跨平台/,
      /Java.*开发/, /Python.*开发/, /Go.*开发/,
      /C\+\+/, /Rust/, /Node\.js/,
      /测试开发/, /DevOps/, /运维开发/,
      /SRE/, /安全工程师/, /安全研究员/,
      /嵌入式/, /硬件工程/, /系统开发/,
      /软件工程/, /软件开发/, /开发工程师/,
      /研发工程师/, /软件工程师/,
      /实施工程师/, /技术支持/, /售后.*技术/,
      /IT/, /网络管理/, /系统管理/,
      /运维工程师/, /网络工程师/,
      /UI.*设计/, /平面设计/, /视觉设计/,
      /交互设计/, /美工/,
      /工程师/,
      /实施顾问/, /软件测试/, /FDE/,
      /数据库管理/, /测试执行/,
      /VR游戏研发/, /VR.*研发/,
      /遥操员/, /灵巧手/,
      /研发.*文档/, /实施运维/,
      /信息安全/, /安全.*优先/,
      /机器人测试/, /测试员/,
    ],
  },
];

export const DEFAULT_CATEGORY = '其他';
export const DEFAULT_COLOR = '#64748b';

// ===== AI 分类数据（由 dataLoader 在加载数据时注入） =====
let aiCategories: { name: string; color: string }[] | null = null;
let aiMap: Record<string, string> | null = null;

/** dataLoader 加载 public/job-categories.json 后调用，注入 AI 分类结果 */
export function setAICategoryData(data: {
  categories: { name: string; color: string }[];
  map: Record<string, string>;
}): void {
  aiCategories = data.categories;
  aiMap = data.map;
}

/** 读取已注入的 AI 分类数据（无则返回 null，调用方回退关键词规则） */
export function getAICategoryData(): {
  categories: { name: string; color: string }[];
  map: Record<string, string>;
} | null {
  if (!aiCategories || !aiMap) return null;
  return { categories: aiCategories, map: aiMap };
}

/** 关键词规则分类（离线回退） */
export function classifyJob(jobTitle: string): { category: string; color: string } {
  for (const rule of CATEGORY_RULES) {
    for (const regex of rule.keywords) {
      if (regex.test(jobTitle)) {
        return { category: rule.category, color: rule.color };
      }
    }
  }
  return { category: DEFAULT_CATEGORY, color: DEFAULT_COLOR };
}

/** 取某分类的颜色（优先 AI 类别，其次关键词规则，最后默认灰） */
function colorFor(category: string): string {
  const ai = aiCategories?.find((c) => c.name === category);
  if (ai) return ai.color;
  const rule = CATEGORY_RULES.find((r) => r.category === category);
  if (rule) return rule.color;
  return DEFAULT_COLOR;
}

/**
 * 分类结果：一个分类下的所有岗位
 */
export interface JobCategoryGroup {
  category: string;
  color: string;
  count: number;
  jobs: Array<{
    id: string;
    companyName: string;
    jobTitle: string;
    status: string;
    timestamp: string;
  }>;
}

/**
 * 将所有投递日志按岗位分类
 * 优先使用 dataLoader 已填充的 log.jobCategory（MiMo 分类），否则回退关键词规则
 */
export function groupJobsByCategory(
  logs: Array<{
    id: string;
    companyName: string;
    jobTitle: string;
    status: string;
    timestamp: string;
    jobCategory?: string;
  }>,
): JobCategoryGroup[] {
  const groups = new Map<string, JobCategoryGroup>();

  for (const log of logs) {
    const category =
      log.jobCategory || (aiMap && aiMap[log.jobTitle]) || classifyJob(log.jobTitle).category;

    if (!groups.has(category)) {
      groups.set(category, { category, color: colorFor(category), count: 0, jobs: [] });
    }

    const group = groups.get(category)!;
    group.count++;
    group.jobs.push({
      id: log.id,
      companyName: log.companyName,
      jobTitle: log.jobTitle,
      status: log.status,
      timestamp: log.timestamp,
    });
  }

  // 按数量降序排列，'其他' 放到最后
  return Array.from(groups.values()).sort((a, b) => {
    if (a.category === DEFAULT_CATEGORY) return 1;
    if (b.category === DEFAULT_CATEGORY) return -1;
    return b.count - a.count;
  });
}

/**
 * 获取所有的分类名称列表（优先 AI 分类体系，回退关键词规则）
 */
export function getAllCategories(): { category: string; color: string }[] {
  if (aiCategories && aiCategories.length) {
    return aiCategories.map((c) => ({ category: c.name, color: c.color }));
  }
  return [
    ...CATEGORY_RULES.map((r) => ({ category: r.category, color: r.color })),
    { category: DEFAULT_CATEGORY, color: DEFAULT_COLOR },
  ];
}
