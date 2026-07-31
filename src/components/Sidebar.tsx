import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, AlertTriangle,
  TrendingUp, Tags, Sun, FileDown, Moon, Sparkles,
} from 'lucide-react';
const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: '投递总览' },
  { to: '/today', icon: Sun, label: '投递记录' },
  { to: '/categories', icon: Tags, label: '岗位分类' },
  { to: '/deductions', icon: AlertTriangle, label: '扣分项统计' },
  { to: '/export', icon: FileDown, label: '导出报告' },
  { to: '/assistant', icon: Sparkles, label: '智能助手' },
];

interface SidebarProps {
  isDark: boolean;
  toggleTheme: () => void;
}

export default function Sidebar({ isDark, toggleTheme }: SidebarProps) {
  const location = useLocation();

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="sidebar__logo-mark">
            <TrendingUp className="w-5 h-5 text-white" strokeWidth={2.25} />
          </div>
          <div>
            <h1 className="font-display text-lg leading-none tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Boss
            </h1>
            <p className="text-xs mt-1 tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
              投递分析
            </p>
          </div>
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to ||
            (item.to !== '/' && location.pathname.startsWith(item.to));
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`nav-link ${isActive ? 'nav-link--active' : 'group'}`}
            >
              <Icon
                className="w-5 h-5 flex-shrink-0 transition-colors"
                style={{
                  color: isActive ? 'var(--accent)' : 'var(--text-tertiary)',
                }}
                strokeWidth={isActive ? 2.25 : 1.75}
              />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* 主题切换 */}
      <div className="px-3 py-2.5" style={{ borderTop: '1px solid var(--border-default)' }}>
        <button
          onClick={toggleTheme}
          className="sidebar-action"
        >
          {isDark ? (
            <Moon className="w-5 h-5" style={{ color: 'var(--accent)' }} strokeWidth={1.75} />
          ) : (
            <Sun className="w-5 h-5" style={{ color: 'var(--warning)' }} strokeWidth={1.75} />
          )}
          <span>{isDark ? '暗色模式' : '亮色模式'}</span>
        </button>
      </div>

      {/* 底部状态 */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid var(--border-default)' }}>
        <div className="flex items-center gap-2.5">
          <div className="relative flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-30" />
          </div>
          <span className="text-2xs font-medium" style={{ color: 'var(--text-secondary)' }}>运行中</span>
          <span className="ml-auto text-2xs font-mono" style={{ color: 'var(--text-tertiary)' }}>v1.0</span>
        </div>
      </div>
    </aside>
  );
}
