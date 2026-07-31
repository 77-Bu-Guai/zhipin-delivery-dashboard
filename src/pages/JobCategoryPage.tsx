import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { groupJobsByCategory, getAllCategories } from '@/utils/jobCategories';
import {
  Tags, Building2, Briefcase, ChevronRight,
  Layers, Code, LineChart, Palette, Megaphone,
  Users, Cpu, Headphones, GraduationCap,
  Rocket, Gamepad2, Film, ClipboardList, Handshake,
  Truck, Calculator, ShieldCheck, Sparkles,
} from 'lucide-react';

const CATEGORY_ICON: Record<string, React.ElementType> = {
  '产品经理': Rocket,
  '项目助理': ClipboardList,
  '游戏相关': Gamepad2,
  'AI内容生成': Film,
  '平台运营': LineChart,
  '人工智能算法': Cpu,
  '数据分析': LineChart,
  '技术研发': Code,
  '软件测试': ShieldCheck,
  '销售商务': Handshake,
  '市场品牌': Megaphone,
  'UI设计': Palette,
  '内容文案': Sparkles,
  '人力资源': Users,
  '行政': Users,
  '财务': Calculator,
  '供应链': Truck,
  '客服': Headphones,
  '研究战略': GraduationCap,
  '教育培训': GraduationCap,
};

const CategoryIcon = ({ category, color }: { category: string; color: string }) => {
  const Icon = CATEGORY_ICON[category] || Layers;
  return (
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: `${color}15`, color }}
    >
      <Icon className="w-4.5 h-4.5" strokeWidth={1.8} />
    </div>
  );
};

export default function JobCategoryPage() {
  const navigate = useNavigate();
  const { getFilteredLogs } = useAppStore();
  const logs = getFilteredLogs();

  if (logs.length === 0) {
    return (
      <div className="w-full flex flex-col items-center justify-center min-h-[65vh] space-y-5 animate-in">
        <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center">
          <Tags className="w-8 h-8 text-warm-400" strokeWidth={1.5} />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold text-warm-700">暂无数据</h2>
          <p className="text-sm text-warm-400">请先导入日志数据</p>
        </div>
        <button onClick={() => navigate('/')} className="btn btn--primary btn--lg">前往导入</button>
      </div>
    );
  }

  const groups = groupJobsByCategory(logs);
  const allCategories = getAllCategories();

  return (
    <div className="w-full space-y-8 animate-in">
      {/* 页面标题 */}
      <div className="flex items-center gap-4">
        <h2 className="font-display text-3xl tracking-tight text-warm-900 dark:text-warm-100">
          岗位分类
        </h2>
        <span className="text-sm text-warm-400">
          共 <span className="text-warm-700 dark:text-warm-300 font-semibold">{logs.length}</span> 个岗位
        </span>
      </div>

      {/* 分类卡片网格 */}
      <div className="grid grid-cols-4 gap-4">
        {allCategories.map(({ category, color }, idx) => {
          const group = groups.find(g => g.category === category);
          const count = group?.count ?? 0;
          const density = logs.length > 0 ? Math.min(100, Math.round((count / logs.length) * 100)) : 0;

          return (
            <button
              key={category}
              onClick={() => navigate(`/category/${encodeURIComponent(category)}`)}
              className={`relative overflow-hidden text-left rounded-2xl border transition-all duration-300 group animate-in animate-in--delay-${Math.min(idx + 1, 5)} bg-white/80 dark:bg-warm-900/60 border-warm-100 dark:border-warm-800 hover:shadow-lg hover:-translate-y-1 hover:border-warm-200 dark:hover:border-warm-700`}
            >
              {/* 顶部动态色条 + 微光 */}
              <div
                className="absolute top-0 left-0 right-0 h-1.5 z-10"
                style={{ backgroundColor: color }}
              />
              <div
                className="absolute top-0 left-0 h-1.5 z-10 opacity-60"
                style={{
                  width: `${density}%`,
                  background: `linear-gradient(90deg, ${color}00 0%, ${color} 50%, ${color}00 100%)`,
                }}
              />

              <div className="relative p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <CategoryIcon category={category} color={color} />
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-warm-900 dark:text-warm-100 truncate" title={category}>
                        {category}
                      </h3>
                      <p className="text-2xs text-warm-400 dark:text-warm-500 mt-0.5">
                        {count > 0 ? `占比 ${density}%` : '暂无投递'}
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-2xs px-2.5 py-1 rounded-full font-bold flex-shrink-0"
                    style={{
                      backgroundColor: `${color}18`,
                      color,
                      border: `1px solid ${color}35`,
                      boxShadow: `0 2px 8px -2px ${color}25`,
                    }}
                  >
                    {count}
                  </span>
                </div>

                {group && group.jobs.length > 0 ? (
                  <div className="space-y-2">
                    {group.jobs.slice(0, 2).map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center gap-2 text-xs rounded-lg px-2.5 py-2 bg-warm-50/80 dark:bg-warm-800/50 border border-warm-100/80 dark:border-warm-800 group-hover:bg-warm-50 dark:group-hover:bg-warm-800 transition-colors"
                      >
                        <div className="w-5 h-5 rounded-md bg-white dark:bg-warm-900 flex items-center justify-center flex-shrink-0 border border-warm-100 dark:border-warm-700">
                          <Building2 className="w-3 h-3 text-warm-400" strokeWidth={1.8} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-warm-700 dark:text-warm-300 truncate">
                            <span className="truncate font-medium" title={job.companyName}>{job.companyName}</span>
                            <span className="text-warm-300 dark:text-warm-600">·</span>
                            <span className="truncate text-warm-500 dark:text-warm-400" title={job.jobTitle}>{job.jobTitle}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {group.jobs.length > 2 && (
                      <div className="flex items-center justify-end pt-1">
                        <span className="inline-flex items-center gap-1 text-2xs font-medium text-warm-400 dark:text-warm-500 bg-warm-50 dark:bg-warm-800/60 px-2 py-1 rounded-full border border-warm-100 dark:border-warm-800">
                          +{group.jobs.length - 2} 更多
                          <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-warm-400 dark:text-warm-500 bg-warm-50/60 dark:bg-warm-800/30 rounded-lg px-3 py-3 border border-dashed border-warm-200 dark:border-warm-800">
                    <Briefcase className="w-3.5 h-3.5" strokeWidth={1.8} />
                    暂未投递此类岗位
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

    </div>
  );
}
