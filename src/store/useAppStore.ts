import { create } from 'zustand';
import { DeliveryLog, DeductionStat, FilterOptions, DailyStatistics } from '@/types';
import { loadExtensionData, parsePipelineToLogs, parseStatisticsToDeductions, getDataSources, getDailyStats, getTodayStats } from '@/utils/dataLoader';

interface AppState {
  logs: DeliveryLog[];
  deductionStats: DeductionStat[];
  dailyStats: DailyStatistics[];
  todayStats: DailyStatistics | null;
  selectedBrowser: 'chrome' | 'firefox' | null;
  isLoading: boolean;
  filterOptions: FilterOptions;
  hasRealData: boolean;
  dataSources: { chrome: boolean; firefox: boolean };

  // Actions
  loadLogs: (browser: 'chrome' | 'firefox') => Promise<void>;
  refreshData: () => Promise<void>;
  clearLogs: () => void;
  setFilterOptions: (options: Partial<FilterOptions>) => void;

  // Computed
  getFilteredLogs: () => DeliveryLog[];
  getSuccessLogs: () => DeliveryLog[];
  getFailedLogs: () => DeliveryLog[];
  getStats: () => { total: number; success: number; failed: number; screened: number; pending: number; successRate: number };
  getLogById: (id: string) => DeliveryLog | undefined;
  getLogsByDeduction: (deductionType: string) => DeliveryLog[];
}

export const useAppStore = create<AppState>((set, get) => ({
  logs: [],
  deductionStats: [],
  dailyStats: [],
  todayStats: null,
  selectedBrowser: null,
  isLoading: false,
  filterOptions: { browser: null, dateRange: null },
  hasRealData: false,
  dataSources: { chrome: false, firefox: false },

  loadLogs: async (browser: 'chrome' | 'firefox') => {
    set({ isLoading: true, selectedBrowser: browser });
    await loadData(set);
  },

  refreshData: async () => {
    set({ isLoading: true });
    await loadData(set);
  },

  clearLogs: () => {
    set({
      logs: [], deductionStats: [], dailyStats: [], todayStats: null, selectedBrowser: null,
      filterOptions: { browser: null, dateRange: null },
      hasRealData: false, dataSources: { chrome: false, firefox: false },
    });
  },

  setFilterOptions: (options) => {
    set((state) => ({
      filterOptions: { ...state.filterOptions, ...options },
    }));
  },

  getFilteredLogs: () => {
    const { logs, filterOptions } = get();
    let filtered = [...logs];
    if (filterOptions.dateRange) {
      const [start, end] = filterOptions.dateRange;
      filtered = filtered.filter((l) => {
        const t = new Date(l.timestamp).getTime();
        return t >= start.getTime() && t <= end.getTime();
      });
    }
    return filtered;
  },

  getSuccessLogs: () => get().getFilteredLogs().filter((l) => l.status === 'success'),
  getFailedLogs: () => get().getFilteredLogs().filter((l) => l.status === 'failed' || l.status === 'screened'),

  getStats: () => {
    const filtered = get().getFilteredLogs();
    const total = filtered.length;
    const success = filtered.filter((l) => l.status === 'success').length;
    const screened = filtered.filter((l) => l.status === 'screened').length;
    const failed = filtered.filter((l) => l.status === 'failed').length;
    const pending = filtered.filter((l) => l.status === 'pending').length;
    const successRate = total > 0 ? Math.round((success / total) * 100) : 0;
    return { total, success, failed, screened, pending, successRate };
  },

  getLogById: (id: string) => get().logs.find((l) => l.id === id),

  getLogsByDeduction: (deductionType: string) => {
    return get().logs.filter((l) => l.message === deductionType);
  },
}));

async function loadData(set: (partial: Partial<AppState>) => void) {
  try {
    console.log('📡 正在加载 extension-data.json...');
    const rawData = await loadExtensionData();
    console.log('📦 原始数据:', rawData ? '获取成功' : '未找到文件');

    if (rawData) {
      console.log('🔧 解析数据中...');
      const logs = parsePipelineToLogs(rawData);
      const deductionStats = parseStatisticsToDeductions(rawData);
      const dailyStats = getDailyStats(rawData);
      const todayStats = getTodayStats(rawData);
      const dataSources = getDataSources(rawData);
      console.log(`📊 解析结果: ${logs.length} 条日志, ${deductionStats.length} 个扣分项`);

      set({
        logs,
        deductionStats,
        dailyStats,
        todayStats,
        isLoading: false,
        hasRealData: true,
        dataSources,
      });
      console.log(`✅ 真实数据: ${logs.length} 条记录 (Chrome: ${dataSources.chrome}, Firefox: ${dataSources.firefox})`);
    } else {
      console.log('⚠️ 无真实数据，生成模拟数据...');
      const { generateMockLogs } = await import('@/utils/mockData');
      const mockLogs = generateMockLogs(60);
      const mockDeductions = parseStatisticsToDeductions({});

      set({
        logs: mockLogs,
        deductionStats: mockDeductions,
        dailyStats: [],
        isLoading: false,
        hasRealData: false,
        dataSources: { chrome: false, firefox: false },
      });
      console.log(`⚠️ 模拟数据: ${mockLogs.length} 条`);
    }
  } catch (err) {
    console.error('❌ 加载数据失败:', err);
    set({ isLoading: false });
  }
}