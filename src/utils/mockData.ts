import { DeliveryLog, BonusPoint, Deduction, AiScoringLog } from '@/types';

const companies = [
  '字节跳动', '阿里巴巴', '腾讯', '美团', '百度', '京东', '网易', '华为',
  '小米', '拼多多', '快手', '滴滴', '哔哩哔哩', '小红书', '蔚来', '理想汽车',
  '商汤科技', '旷视科技', '大疆', '地平线', '寒武纪', '科大讯飞', '海康威视',
  '蚂蚁集团', '微众银行', 'SHEIN', 'Shopee', 'Lazada', 'Zoom', '米哈游',
];

const jobTitles = [
  '高级前端工程师', 'Java 后端开发', 'Python 开发工程师', 'Golang 工程师',
  '数据科学家', 'AI 算法工程师', '产品经理', '测试开发工程师',
  'DevOps 工程师', '全栈工程师', 'iOS 开发工程师', 'Android 开发工程师',
  '大数据开发工程师', '安全工程师', '架构师', '技术总监',
];

const jdTemplates = [
  `【岗位职责】
1. 负责公司核心业务系统的前端架构设计与开发
2. 参与产品需求评审，提供技术方案设计
3. 优化前端性能，提升用户体验
4. 编写单元测试，保证代码质量
5. 参与技术分享，推动团队技术成长

【任职要求】
1. 计算机相关专业本科及以上学历
2. 3年以上前端开发经验
3. 精通 React/Vue 等主流框架
4. 熟悉 TypeScript，有良好的编码习惯
5. 了解 Node.js 服务端开发
6. 有大型项目开发经验优先`,
  `【岗位职责】
1. 负责后端服务的设计、开发与维护
2. 参与系统架构设计和技术选型
3. 优化数据库性能，保证系统稳定性
4. 编写技术文档和接口文档
5. 参与代码评审，保证代码质量

【任职要求】
1. 计算机相关专业本科及以上学历
2. 精通 Java/Python/Go 至少一门语言
3. 熟悉微服务架构设计
4. 熟悉 MySQL、Redis 等常用数据库
5. 有分布式系统开发经验
6. 良好的沟通能力和团队协作精神`,
  `【岗位职责】
1. 负责数据分析和挖掘工作
2. 构建数据模型，支持业务决策
3. 开发数据可视化工具和报表
4. 参与数据平台建设
5. 跟踪行业最新技术动态

【任职要求】
1. 统计学、数学、计算机相关专业硕士及以上学历
2. 精通 Python，熟悉 SQL
3. 熟悉机器学习算法
4. 有大数据处理经验（Spark/Hadoop）
5. 良好的数据敏感度和逻辑思维能力
6. 有相关项目经验者优先`,
];

const deductionTypes = [
  { type: '学历不匹配', reasons: ['要求硕士学历', '要求985/211院校', '专业不对口'] },
  { type: '技能缺失', reasons: ['缺少 Kubernetes 经验', '缺少微服务经验', '缺少大数据经验', '不熟悉指定框架'] },
  { type: '经验不足', reasons: ['工作经验不足3年', '缺少管理经验', '缺少项目主导经验', '行业经验不足'] },
  { type: '薪资要求过高', reasons: ['期望薪资超出预算', '总包超出HC范围'] },
  { type: '年龄因素', reasons: ['年龄超出团队范围', '年龄与职级不匹配'] },
  { type: '地点不匹配', reasons: ['不接受异地办公', '通勤时间过长'] },
  { type: '语言能力不足', reasons: ['英语口语不达标', '缺少英文文档能力'] },
  { type: '行业背景不符', reasons: ['缺少金融行业背景', '缺少电商行业经验', '缺少游戏行业经验'] },
];

const bonusCategories = [
  { category: '技能匹配', items: ['精通 React/Vue', 'TypeScript 熟练', 'Node.js 经验', 'Docker 使用经验', 'CI/CD 经验'] },
  { category: '学历优势', items: ['硕士学历', '985/211 院校', '计算机相关专业', '有论文发表'] },
  { category: '经验优势', items: ['5年以上经验', '有大厂背景', '有项目主导经验', '有开源贡献'] },
  { category: '软技能', items: ['沟通能力强', '团队协作好', '有技术分享经验', '英语流利'] },
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysBack: number): string {
  const now = new Date();
  const past = new Date(now.getTime() - Math.random() * daysBack * 24 * 60 * 60 * 1000);
  return past.toISOString();
}

function generateDeductions(): Deduction[] {
  const count = randomInt(0, 4);
  const used = new Set<string>();
  const result: Deduction[] = [];
  for (let i = 0; i < count; i++) {
    const dt = randomItem(deductionTypes);
    if (used.has(dt.type)) continue;
    used.add(dt.type);
    result.push({
      type: dt.type,
      reason: randomItem(dt.reasons),
      timestamp: randomDate(30),
    });
  }
  return result;
}

function generateBonusPoints(): BonusPoint[] {
  const count = randomInt(2, 5);
  const used = new Set<string>();
  const result: BonusPoint[] = [];
  for (let i = 0; i < count; i++) {
    const bc = randomItem(bonusCategories);
    if (used.has(bc.category)) continue;
    used.add(bc.category);
    result.push({
      category: bc.category,
      description: randomItem(bc.items),
      matched: Math.random() > 0.3,
    });
  }
  return result;
}

// AI 评分消息模板
const aiScoreTemplates: { pos: string[]; neg: string[]; base: number }[] = [
  {
    base: -920,
    neg: [
      '明确要求英语可作为工作语言（/500分）',
      '要求小语种（泰语/越南语），属于外语岗位范畴（/500分）',
    ],
    pos: [
      '岗位涉及 AI/大模型/智能体相关业务（/10分）',
      '岗位职责包含用户运营、内容运营、活动策划等，符合产品运营/项目统筹方向（/50分）',
      '明确写五险一金（/10分）',
      '福利包含零食下午茶、团建聚餐（/10分）',
    ],
  },
  {
    base: -450,
    neg: [
      '要求全日制本科及以上学历（/300分）',
      '需要 3 年以上相关工作经验（/200分）',
    ],
    pos: [
      '岗位涉及 AI/大模型相关业务（/10分）',
      '岗位地点在深圳南山区，通勤方便（/10分）',
      '明确写五险一金（/10分）',
      '岗位职责包含项目管理内容（/30分）',
    ],
  },
  {
    base: -120,
    neg: [
      '要求硕士及以上学历（/100分）',
      '需要具备金融行业背景（/50分）',
    ],
    pos: [
      '岗位涉及 AI/智能体产品方向（/10分）',
      '岗位职责包含产品运营、数据分析等内容（/30分）',
      '明确写五险一金（/10分）',
      '福利包含零食下午茶、团建聚餐（/10分）',
      '双休，不加班（/10分）',
    ],
  },
  {
    base: 35,
    neg: [
      '要求 985/211 院校背景（/50分）',
    ],
    pos: [
      '岗位涉及 AI 产品方向（/10分）',
      '岗位职责包含产品设计、需求分析等（/30分）',
      '明确写五险一金（/10分）',
      '福利包含零食下午茶、团建聚餐（/10分）',
      '双休，朝九晚六（/10分）',
      '岗位为应届生开放（/15分）',
    ],
  },
  {
    base: -680,
    neg: [
      '要求具备 5 年以上工作经验（/400分）',
      '要求全日制硕士及以上学历（/300分）',
      '需要具备管理经验（/100分）',
    ],
    pos: [
      '岗位涉及大模型应用方向（/10分）',
      '岗位职责包含项目统筹、需求分析等内容（/50分）',
      '明确写五险一金（/10分）',
      '福利包含零食下午茶、团建聚餐（/10分）',
      '双休（/10分）',
    ],
  },
];

function generateAiScoreMessage(): string {
  const tmpl = randomItem(aiScoreTemplates);
  const posPart = tmpl.pos.join('\n');
  const negPart = tmpl.neg.join('\n');
  return `分数${tmpl.base}\n消极（扣分）：\n${negPart}\n积极（加分）：\n${posPart}`;
}

export function generateMockLogs(count: number = 60): DeliveryLog[] {
  const logs: DeliveryLog[] = [];
  const usedCompanies = new Set<string>();

  for (let i = 0; i < count; i++) {
    const company = randomItem(companies);
    const statusRoll = Math.random();
    const status: DeliveryLog['status'] = statusRoll < 0.45 ? 'success' : statusRoll < 0.70 ? 'screened' : statusRoll < 0.85 ? 'failed' : 'pending';

    logs.push({
      id: `log-${i + 1}-${Date.now()}`,
      timestamp: randomDate(30),
      browser: Math.random() > 0.5 ? 'chrome' : 'firefox',
      companyName: company,
      jobTitle: randomItem(jobTitles),
      status,
      jd: randomItem(jdTemplates),
      bonusPoints: generateBonusPoints(),
      deductions: generateDeductions(),
      aiScoring: Math.random() > 0.4 ? {
        time: Date.now(),
        encryptJobId: `mock-${i}-${Date.now()}`,
        jobName: randomItem(jobTitles),
        companyName: company,
        state: 'warning',
        state_name: 'AI筛选',
        message: generateAiScoreMessage(),
        errMsg: '',
        errState: '过滤',
      } : undefined,
      url: `https://www.zhipin.com/job_detail/${i + 1}.html`,
      message: status === 'success' ? '沟通中' : status === 'screened' ? 'AI筛选' : status === 'failed' ? '投递失败' : '待处理',
      processorType: status === 'screened' || status === 'failed' ? 'aiFiltering' : 'basic',
      encryptJobId: `mock-${i}-${Date.now()}`,
    });
    usedCompanies.add(company);
  }

  // 按时间降序排列
  logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return logs;
}