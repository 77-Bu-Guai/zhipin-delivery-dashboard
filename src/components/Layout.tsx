import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAppStore } from '@/store/useAppStore';
import { useTheme } from '@/hooks/useTheme';

export default function Layout() {
  const { refreshData, startAutoRefresh } = useAppStore();
  const location = useLocation();
  const initRef = useRef(false);

  // 主题
  const { theme, toggleTheme, isDark } = useTheme();

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

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-root)' }}>
      <Sidebar isDark={isDark} toggleTheme={toggleTheme} />
      <main className="ml-56 min-h-screen">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
