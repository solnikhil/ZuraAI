/**
 * Performance Monitoring Module Index
 * 
 * Exports all performance-related utilities for the Electron main process.
 */

export {
  MemoryMonitor,
  memoryMonitor,
  initializeMemoryMonitoring,
  cleanupMemoryMonitoring,
  type MemoryMetrics,
  type MemoryThresholds,
  type MemoryMonitorConfig,
} from './memoryMonitor';

export {
  PerformanceMonitor,
  performanceMonitor,
  initializePerformanceMonitoring,
  getPerformanceSummary,
  type PerformanceMetrics,
  type StartupTimingMetrics,
  type IPCMetrics,
  type PerformanceThresholds,
} from './monitor';

export {
  MetricsLogger,
  metricsLogger,
  getMetricsLogFilePath,
  type MetricsLogEntry,
  type MetricsLog,
} from './metricsLog';
