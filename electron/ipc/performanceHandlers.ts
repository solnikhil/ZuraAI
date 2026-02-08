/**
 * Performance IPC Handlers
 * 
 * This module registers IPC handlers for performance metrics communication
 * between the renderer and main process.
 * 
 * **Validates: Requirement 6.3**
 * THE Renderer_Process SHALL track and report Time To Interactive (TTI) and 
 * First Contentful Paint (FCP) metrics
 */

import { ipcMain } from 'electron';
import { performanceMonitor, type RendererMetrics } from '../performance/monitor';
import { metricsLogger } from '../performance/metricsLog';

/**
 * Register performance-related IPC handlers
 */
export function registerPerformanceHandlers(): void {
  // Handler for receiving renderer performance metrics
  // This is called by the renderer process to report FCP, TTI, and other web vitals
  ipcMain.handle('performance:report-renderer-metrics', async (_event, metrics: RendererMetrics) => {
    try {
      // Validate the metrics object
      if (!metrics || typeof metrics !== 'object') {
        console.warn('[PerformanceHandlers] Invalid metrics received');
        return { success: false, error: 'Invalid metrics object' };
      }

      // Update the performance monitor with renderer metrics
      performanceMonitor.updateRendererMetrics(metrics);

      // Log the metrics entry
      const fullMetrics = performanceMonitor.getMetrics();
      const { warnings } = performanceMonitor.checkThresholds();
      await metricsLogger.addEntry(fullMetrics, warnings);

      return { success: true };
    } catch (error) {
      console.error('[PerformanceHandlers] Error processing renderer metrics:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Handler for getting current performance metrics (including renderer metrics)
  ipcMain.handle('performance:get-metrics', async () => {
    try {
      return performanceMonitor.getMetrics();
    } catch (error) {
      console.error('[PerformanceHandlers] Error getting metrics:', error);
      return null;
    }
  });

  // Handler for getting renderer metrics only
  ipcMain.handle('performance:get-renderer-metrics', async () => {
    try {
      return performanceMonitor.getRendererMetrics();
    } catch (error) {
      console.error('[PerformanceHandlers] Error getting renderer metrics:', error);
      return null;
    }
  });

  // Handler for checking performance thresholds
  ipcMain.handle('performance:check-thresholds', async () => {
    try {
      return performanceMonitor.checkThresholds();
    } catch (error) {
      console.error('[PerformanceHandlers] Error checking thresholds:', error);
      return { warnings: [] };
    }
  });

  console.log('[PerformanceHandlers] Performance IPC handlers registered');
}

/**
 * Unregister performance-related IPC handlers
 */
export function unregisterPerformanceHandlers(): void {
  ipcMain.removeHandler('performance:report-renderer-metrics');
  ipcMain.removeHandler('performance:get-metrics');
  ipcMain.removeHandler('performance:get-renderer-metrics');
  ipcMain.removeHandler('performance:check-thresholds');
  console.log('[PerformanceHandlers] Performance IPC handlers unregistered');
}
