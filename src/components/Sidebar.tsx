import { NavLink, useLocation } from 'react-router-dom';
import { Upload, LayoutDashboard, AlertTriangle, FileDown, TrendingUp } from 'lucide-react';

const navItems = [
  { to: '/', icon: Upload, label: '数据导入' },
  { to: '/dashboard', icon: LayoutDashboard, label: '投递总览' },
  { to: '/deductions', icon: AlertTriangle, label: '扣分项统计' },
  { to: '/export', icon: FileDown, label: '导出报告' },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-60 h-screen bg-slate-900/80 backdrop-blur-xl border-r border-slate-700/50 flex flex-col fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="p-6 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/25">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide">Boss 分析</h1>
            <p className="text-[10px] text-slate-400">投递日志分析工具</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/10 text-cyan-300 border border-cyan-500/30 shadow-lg shadow-cyan-500/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-700/50">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          系统运行中
        </div>
      </div>
    </aside>
  );
}