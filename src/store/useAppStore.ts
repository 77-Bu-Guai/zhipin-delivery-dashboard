import { create } from 'zustand';
import { DeliveryLog, DeductionStat, FilterOptions, DailyStatistics, AiScoringLog, AiDeductionCategory } from '@/types';
import { loadExtensionData, parsePipelineToLogs, parseStatisticsToDeductions, getDataSources, getDailyStats, getTodayStats, getAiScoringLogs, parseAiDeductionsFromLogs, buildCategoriesFromMap } from '@/utils/dataLoader';
import { devLog } from '@/lib/utils';

export type BrowserFilter = 'all' | 'chrome' | 'firefox';

interface AppState {
  logs: DeliveryLog[];
  deductionStats: DeductionStat[];
  dailyStats: DailyStatistics[];
  todayStats: DailyStatistics | null;
  rawAiScoringLogs: AiScoringLog[];
  deductionCategories: AiDeductionCategory[];
  selectedBrowser: 'chrome' | 'firefox' | null;
  isLoading: boolean;
  filterOptions: FilterOptions;
  hasRealData: boolean;
  dataSources: { chrome: boolean; firefox: boolean };
  lastUpdated: Date | null;
  lastFullReload: Date | null;
  autoRefreshInterval: number | null;
  browserFilter: BrowserFilter;

  // Actions
  loadLogs: (browser: 'chrome' | 'firefox') => Promise<void>;
  refreshData: () => Promise<void>;
  clearLogs: () => void;
  setFilterOptions: (options: Partial<FilterOptions>) => void;
  setBrowserFilter: (filter: BrowserFilter) => void;

  // Computed
  getFilteredLogs: () => DeliveryLog[];
  getLogsByBrowser: () => DeliveryLog[];
  getSuccessLogs: () => DeliveryLog[];
  getFailedLogs: () => DeliveryLog[];
  getStats: () => { total: number; success: number; failed: number; screened: number; pending: number; successRate: number };
  getLogById: (id: string) => DeliveryLog | undefined;
  getLogsByDeduction: (deductionType: string) => DeliveryLog[];
  hasPipelineData: () => boolean;
  hasWebStatsData: () => boolean;
  startAutoRefresh: (intervalMs?: number) => void;
  stopAutoRefresh: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  logs: [],
  deductionStats: [],
  dailyStats: [],
  todayStats: null,
  rawAiScoringLogs: [],
  deductionCategories: [],
  selectedBrowser: null,
  isLoading: false,
  filterOptions: { browser: null, dateRange: null },
  hasRealData: false,
  dataSources: { chrome: false, firefox: false },
  lastUpdated: null,
  lastFullReload: null,
  autoRefreshInterval: null,
  browserFilter: 'all',

  loadLogs: async (browser: 'chrome' | 'firefox') => {
    set({ isLoading: true, selectedBrowser: browser });
    await loadFullData(set);
  },

  refreshData: async () => {
    const { logs, lastFullReload } = get();

    // watch 模式下 extension-delta.json 几乎总是空的（prevSnapshot 跟 currentIds 一致
    // 时 newIds = 0），导致增量读取返回空，网站以为"没新数据"。
    // 因此：只要有数据 + 距离上次全量超过 5 秒，就强制全量刷新，确保跟 export-logs.cjs 同步。
    const now = Date.now();
    const needFullReload = logs.length === 0
      || !lastFullReload
      || (now - lastFullReload.getTime() > 5000);

    if (needFullReload) {
      devLog.log(`🔄 ${logs.length === 0 ? '首次' : '5秒兜底'}全量刷新...`);
      set({ isLoading: true });
      await loadFullData(set, true);
      return;
    }

    // 两次全量之间很近 → 跳过，避免频繁拉取 5MB 文件
    devLog.log('⏭️ 跳过刷新（5秒内已有全量）');
    return;
  },

  clearLogs: () => {
    const { autoRefreshInterval } = get();
    if (autoRefreshInterval !== null) window.clearInterval(autoRefreshInterval);
    set({
      logs: [], deductionStats: [], dailyStats: [], todayStats: null, selectedBrowser: null,
      filterOptions: { browser: null, dateRange: null }, dataSources: { chrome: false, firefox: false },
      hasRealData: false, lastUpdated: null, lastFullReload: null, browserFilter: 'all',
    });
  },

  setFilterOptions: (options) => {
    set((state) => ({ filterOptions: { ...state.filterOptions, ...options } }));
  },

  setBrowserFilter: (filter) => {
    set({ browserFilter: filter });
  },

  /** 基础筛选：仅按浏览器过滤，不含日期范围 */
  getLogsByBrowser: () => {
    const { logs, browserFilter } = get();
    if (browserFilter === 'all') return logs;
    return logs.filter((l) => l.browser === browserFilter);
  },

  getFilteredLogs: () => {
    const { logs, filterOptions, browserFilter } = get();
    let filtered = [...logs];

    // 浏览器筛选
    if (browserFilter !== 'all') {
      filtered = filtered.filter((l) => l.browser === browserFilter);
    }

    // 日期范围筛选
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
    return get().getFilteredLogs().filter((l) => l.message === deductionType);
  },

  hasPipelineData: () => get().logs.length > 0,

  hasWebStatsData: () => {
    const { dailyStats, deductionStats, rawAiScoringLogs, deductionCategories } = get();
    return dailyStats.length > 0 || deductionStats.length > 0 || rawAiScoringLogs.length > 0 || deductionCategories.length > 0;
  },

  startAutoRefresh: (intervalMs = 15000) => {
    const { autoRefreshInterval } = get();
    if (autoRefreshInterval) return;
    const id = window.setInterval(async () => {
      devLog.log('🔄 自动刷新数据...');
      await get().refreshData();
    }, intervalMs);
    set({ autoRefreshInterval: id });
    devLog.log(`⏱ 自动刷新已启动，间隔 ${intervalMs}ms`);
  },

  stopAutoRefresh: () => {
    const { autoRefreshInterval } = get();
    if (autoRefreshInterval !== null) {
      window.clearInterval(autoRefreshInterval);
      set({ autoRefreshInterval: null });
      devLog.log('⏱ 自动刷新已停止');
    }
  },
}));

/** 全量加载 */
async function loadFullData(set: (partial: Partial<AppState>) => void, isFullReload = false) {
  try {
    devLog.log('📡 正在加载 extension-data.json...');
    const rawData = await loadExtensionData();
    devLog.log('📦 原始数据:', rawData ? '获取成功' : '未找到文件');

    if (rawData) {
      devLog.log('🔧 解析数据中...');
      const logs = parsePipelineToLogs(rawData);
      const deductionStats = parseStatisticsToDeductions(rawData);
      const dailyStats = getDailyStats(rawData);
      const todayStats = getTodayStats(rawData);
      let dataSources = getDataSources(rawData);

      // 如果 _meta.sources 不完整，从实际日志中推断浏览器来源
      if (!dataSources.chrome || !dataSources.firefox) {
        const inferredSources = {
          chrome: logs.some(l => l.browser === 'chrome'),
          firefox: logs.some(l => l.browser === 'firefox'),
        };
        // 只填充 _meta 缺失的项
        dataSources = {
          chrome: dataSources.chrome || inferredSources.chrome,
          firefox: dataSources.firefox || inferredSources.firefox,
        };
      }

      const rawAiRaw = getAiScoringLogs(rawData);
      const rawAiScoringLogs = rawAiRaw || [];

      // AI 合并分类（来自 classifyAndMerge → _mergedCategories）
      const mergedCats = (rawData as any)._mergedCategories;
      const deductionCategories = mergedCats
        ? buildCategoriesFromMap(mergedCats, logs)
        : parseAiDeductionsFromLogs(logs);

      if (mergedCats) {
        const uniqueKeys = new Set(Object.values(mergedCats).map((v: any) => v.mergedKey));
        devLog.log(`🤖 AI 合并分类: ${Object.keys(mergedCats).length} 种原因 → ${uniqueKeys.size} 个类别`);
      }

      devLog.log(`📊 解析结果: ${logs.length} 条日志, ${deductionStats.length} 个网页扣分项, ${deductionCategories.length} 个AI扣分类别`);

      set({
        logs,
        deductionStats,
        dailyStats,
        todayStats,
        rawAiScoringLogs,
        deductionCategories,
        isLoading: false,
        hasRealData: true,
        dataSources,
        lastUpdated: new Date(),
        ...(isFullReload ? { lastFullReload: new Date() } : {}),
      });
      devLog.log(`✅ 真实数据: ${logs.length} 条记录 (Chrome: ${dataSources.chrome}, Firefox: ${dataSources.firefox})`);
    } else {
      devLog.log('⚠️ 无真实数据，生成模拟数据...');
      const { generateMockLogs } = await import('@/utils/mockData');
      const mockLogs = generateMockLogs(60);
      const mockDeductions = parseStatisticsToDeductions({});

      // 从 mock 数据中推断浏览器来源，而非硬编码为 false
      const mockDataSources = {
        chrome: mockLogs.some(l => l.browser === 'chrome'),
        firefox: mockLogs.some(l => l.browser === 'firefox'),
      };

      set({
        logs: mockLogs,
        deductionStats: mockDeductions,
        dailyStats: [],
        rawAiScoringLogs: [],
        deductionCategories: parseAiDeductionsFromLogs(mockLogs),
        isLoading: false,
        hasRealData: false,
        dataSources: mockDataSources,
        lastUpdated: new Date(),
        ...(isFullReload ? { lastFullReload: new Date() } : {}),
      });
      devLog.log(`⚠️ 模拟数据: ${mockLogs.length} 条`);
    }
  } catch (err) {
    console.error('❌ 加载数据失败:', err);
    set({ isLoading: false });
  }
}
