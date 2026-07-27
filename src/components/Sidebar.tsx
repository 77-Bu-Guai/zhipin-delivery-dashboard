import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, AlertTriangle,
  TrendingUp, Tags, Sun, Globe, Lightbulb, FileDown, Moon,
} from 'lucide-react';
import { useAppStore, BrowserFilter } from '@/store/useAppStore';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: '投递总览' },
  { to: '/today', icon: Sun, label: '投递记录' },
  { to: '/categories', icon: Tags, label: '岗位分类' },
  { to: '/deductions', icon: AlertTriangle, label: '扣分项统计' },
  { to: '/export', icon: FileDown, label: '导出报告' },
  { to: '/optimize', icon: Lightbulb, label: '提示词优化' },
];

const BROWSER_OPTIONS: { value: BrowserFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'chrome', label: 'Chrome' },
  { value: 'firefox', label: 'Firefox' },
];

interface SidebarProps {
  isDark: boolean;
  toggleTheme: () => void;
}

export default function Sidebar({ isDark, toggleTheme }: SidebarProps) {
  const location = useLocation();
  const { browserFilter, setBrowserFilter, dataSources } = useAppStore();

  return (
    <aside className="w-56 h-screen bg-white border-r border-warm-100 flex flex-col fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent-500 flex items-center justify-center shadow-sm shadow-accent-500/15">
            <TrendingUp className="w-4.5 h-4.5 text-white" strokeWidth={2} />
          </div>
          <div>
            <h1 className="font-display text-lg leading-none tracking-tight text-warm-900">
              Boss
            </h1>
            <p className="text-2xs text-warm-400 mt-0.5 tracking-wide">
              投递分析
            </p>
          </div>
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to ||
            (item.to !== '/' && location.pathname.startsWith(item.to));
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`
                relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-200 group
                ${isActive
                  ? 'bg-accent-50 text-accent-700'
                  : 'text-warm-500 hover:text-warm-700 hover:bg-warm-50'
                }
              `}
            >
              {/* 活跃指示条 */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-full bg-accent-500" />
              )}

              <Icon
                className={`w-4.5 h-4.5 flex-shrink-0 transition-colors ${
                  isActive ? 'text-accent-500' : 'text-warm-400 group-hover:text-warm-500'
                }`}
                strokeWidth={isActive ? 2.25 : 1.75}
              />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* 浏览器筛选 */}
      <div className="px-4 py-3 border-t border-warm-100">
        <p className="text-2xs text-warm-400 font-semibold mb-2.5 uppercase tracking-widest">
          数据源
        </p>
        <div className="flex rounded-lg bg-warm-50 border border-warm-200 p-0.5">
          {BROWSER_OPTIONS.map((opt) => {
            const active = browserFilter === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setBrowserFilter(opt.value)}
                className={`
                  flex-1 py-1.5 rounded-md text-xs font-medium
                  transition-all duration-200
                  ${active
                    ? 'bg-white text-warm-800 shadow-sm border border-warm-200/80'
                    : 'text-warm-400 hover:text-warm-600'
                  }
                `}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 主题切换 */}
      <div className="px-4 py-3 border-t border-warm-100">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-warm-500 hover:text-warm-700 hover:bg-warm-50 transition-colors"
        >
          <Moon className={`w-4 h-4 ${isDark ? 'text-accent-500' : ''}`} strokeWidth={1.75} />
          <span className="text-xs">{isDark ? '暗色模式' : '亮色模式'}</span>
        </button>
      </div>

      {/* 底部状态 */}
      <div className="px-4 py-3.5 border-t border-warm-100">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-30" />
          </div>
          <span className="text-2xs text-warm-500 font-medium">运行中</span>
          <span className="ml-auto text-2xs text-warm-300 font-mono">v1.0</span>
        </div>
        {/* 数据源状态 */}
        {dataSources && (dataSources.chrome || dataSources.firefox) && (
          <div className="flex gap-3 mt-2.5 pt-2.5 border-t border-warm-100">
            {dataSources.chrome && (
              <span className="text-2xs text-emerald-600 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                Chrome
              </span>
            )}
            {dataSources.firefox && (
              <span className="text-2xs text-orange-500 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                Firefox
              </span>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
