import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, TrendingUp } from 'lucide-react';
import Sidebar from './Sidebar';
import { useAppStore } from '@/store/useAppStore';
import { useTheme } from '@/hooks/useTheme';

export default function Layout() {
  const { refreshData, startAutoRefresh } = useAppStore();
  const location = useLocation();
  const initRef = useRef(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // 主题
  const { toggleTheme, isDark } = useTheme();

  // 用 ref 保存最新回调，避免 visibilitychange 监听器持有过期闭包
  const refreshDataRef = useRef(refreshData);
  refreshDataRef.current = refreshData;

  // 全局自动刷新（仅首次挂载时执行）
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      refreshData();
      startAutoRefresh(30000);
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshDataRef.current();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshData, startAutoRefresh]);

  // 关键页面切换时刷新
  useEffect(() => {
    if (location.pathname === '/today' || location.pathname === '/dashboard') {
      refreshData();
    }
  }, [location.pathname]);

  // 打开移动端菜单时禁止背景滚动
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-root)' }}>
      {/* 移动端顶部导航栏 */}
      <header
        className="lg:hidden fixed top-0 inset-x-0 h-14 z-30 flex items-center justify-between px-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-accent-500 to-accent-600 shadow-md shadow-accent-500/20">
            <TrendingUp className="w-4 h-4 text-white" strokeWidth={2.25} />
          </div>
          <div>
            <h1
              className="font-display text-base leading-none tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              Boss
            </h1>
            <p
              className="text-[10px] mt-0.5 tracking-wide"
              style={{ color: 'var(--text-tertiary)' }}
            >
              投递分析
            </p>
          </div>
        </div>
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 rounded-lg transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="打开菜单"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      <Sidebar
        isDark={isDark}
        toggleTheme={toggleTheme}
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* 移动端侧边栏遮罩 */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <main className="min-h-screen select-text lg:ml-56 pt-14 lg:pt-0">
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:pl-8 lg:pr-3 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
