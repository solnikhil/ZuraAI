/**
 * Unit tests for Memory Monitor
 * 
 * Tests the memory monitoring and cleanup functionality.
 * **Validates: Requirements 4.6, 6.6**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryMonitor, type MemoryMetrics } from './memoryMonitor';

// Mock Electron's app module
vi.mock('electron', () => ({
  app: {
    getAppMetrics: vi.fn(() => [
      {
        pid: 1234,
        type: 'Browser',
        memory: { workingSetSize: 100 * 1024 }, // 100MB in KB
        cpu: { percentCPUUsage: 5 },
      },
      {
        pid: 5678,
        type: 'GPU',
        memory: { workingSetSize: 50 * 1024 }, // 50MB in KB
        cpu: { percentCPUUsage: 2 },
      },
    ]),
  },
}));

describe('MemoryMonitor', () => {
  let monitor: MemoryMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    monitor = new MemoryMonitor();
  });

  afterEach(() => {
    monitor.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('getMemoryMetrics', () => {
    it('should return memory metrics with all required fields', () => {
      const metrics = monitor.getMemoryMetrics();

      expect(metrics).toHaveProperty('heapUsed');
      expect(metrics).toHaveProperty('heapTotal');
      expect(metrics).toHaveProperty('external');
      expect(metrics).toHaveProperty('rss');
      expect(metrics).toHaveProperty('timestamp');

      expect(typeof metrics.heapUsed).toBe('number');
      expect(typeof metrics.heapTotal).toBe('number');
      expect(typeof metrics.external).toBe('number');
      expect(typeof metrics.rss).toBe('number');
      expect(typeof metrics.timestamp).toBe('number');
    });

    it('should return positive values for memory metrics', () => {
      const metrics = monitor.getMemoryMetrics();

      expect(metrics.heapUsed).toBeGreaterThan(0);
      expect(metrics.heapTotal).toBeGreaterThan(0);
      expect(metrics.rss).toBeGreaterThan(0);
    });
  });

  describe('start/stop', () => {
    it('should start monitoring', () => {
      expect(monitor.isMonitoring()).toBe(false);
      monitor.start();
      expect(monitor.isMonitoring()).toBe(true);
    });

    it('should stop monitoring', () => {
      monitor.start();
      expect(monitor.isMonitoring()).toBe(true);
      monitor.stop();
      expect(monitor.isMonitoring()).toBe(false);
    });

    it('should not start twice', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      monitor.start();
      monitor.start();
      expect(consoleSpy).toHaveBeenCalledWith('[MemoryMonitor] Already running');
      consoleSpy.mockRestore();
    });
  });

  describe('periodic monitoring', () => {
    it('should perform initial check on start', () => {
      monitor.start();
      const metrics = monitor.getLastMetrics();
      expect(metrics).not.toBeNull();
    });

    it('should perform checks at configured interval', () => {
      const customMonitor = new MemoryMonitor({ intervalMs: 1000 });
      customMonitor.start();

      const initialMetrics = customMonitor.getLastMetrics();
      expect(initialMetrics).not.toBeNull();

      // Advance time by 1 second
      vi.advanceTimersByTime(1000);

      const newMetrics = customMonitor.getLastMetrics();
      expect(newMetrics).not.toBeNull();
      expect(newMetrics!.timestamp).toBeGreaterThanOrEqual(initialMetrics!.timestamp);

      customMonitor.stop();
    });
  });

  describe('cleanup callbacks', () => {
    it('should register and call cleanup callbacks', () => {
      const callback = vi.fn();
      monitor.registerCleanupCallback(callback);
      monitor.triggerCleanup();

      expect(callback).toHaveBeenCalled();
    });

    it('should unregister cleanup callbacks', () => {
      const callback = vi.fn();
      const unregister = monitor.registerCleanupCallback(callback);
      unregister();
      monitor.triggerCleanup();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle async cleanup callbacks', async () => {
      const asyncCallback = vi.fn().mockResolvedValue(undefined);
      monitor.registerCleanupCallback(asyncCallback);
      monitor.triggerCleanup();

      expect(asyncCallback).toHaveBeenCalled();
    });

    it('should handle cleanup callback errors gracefully', () => {
      const errorCallback = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      monitor.registerCleanupCallback(errorCallback);
      
      // Should not throw
      expect(() => monitor.triggerCleanup()).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('configuration', () => {
    it('should use default configuration', () => {
      const config = monitor.getConfig();

      expect(config.intervalMs).toBe(30000);
      expect(config.thresholds.cleanupThresholdMB).toBe(500);
      expect(config.thresholds.warningThresholdMB).toBe(800);
    });

    it('should allow custom configuration', () => {
      const customMonitor = new MemoryMonitor({
        intervalMs: 10000,
        thresholds: {
          cleanupThresholdMB: 300,
          warningThresholdMB: 600,
        },
      });

      const config = customMonitor.getConfig();

      expect(config.intervalMs).toBe(10000);
      expect(config.thresholds.cleanupThresholdMB).toBe(300);
      expect(config.thresholds.warningThresholdMB).toBe(600);
    });

    it('should update configuration', () => {
      monitor.updateConfig({
        thresholds: {
          cleanupThresholdMB: 400,
          warningThresholdMB: 700,
        },
      });

      const config = monitor.getConfig();
      expect(config.thresholds.cleanupThresholdMB).toBe(400);
      expect(config.thresholds.warningThresholdMB).toBe(700);
    });
  });

  describe('forceCheck', () => {
    it('should perform immediate check and return metrics', () => {
      const metrics = monitor.forceCheck();

      expect(metrics).not.toBeNull();
      expect(metrics.timestamp).toBeGreaterThan(0);
    });
  });

  describe('threshold callbacks', () => {
    it('should call onCleanupNeeded when cleanup threshold exceeded', () => {
      const onCleanupNeeded = vi.fn();
      
      // Create monitor with very low threshold to trigger cleanup
      const lowThresholdMonitor = new MemoryMonitor({
        thresholds: {
          cleanupThresholdMB: 0.001, // Very low threshold
          warningThresholdMB: 0.002,
        },
        onCleanupNeeded,
      });

      lowThresholdMonitor.forceCheck();

      expect(onCleanupNeeded).toHaveBeenCalled();
    });

    it('should call onWarning when warning threshold exceeded', () => {
      const onWarning = vi.fn();
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Create monitor with very low threshold to trigger warning
      const lowThresholdMonitor = new MemoryMonitor({
        thresholds: {
          cleanupThresholdMB: 0.001,
          warningThresholdMB: 0.001, // Very low threshold
        },
        onWarning,
      });

      lowThresholdMonitor.forceCheck();

      expect(onWarning).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

describe('MemoryMetrics interface', () => {
  it('should match the design document interface', () => {
    const monitor = new MemoryMonitor();
    const metrics = monitor.getMemoryMetrics();

    // Verify all fields from the design document are present
    const requiredFields: (keyof MemoryMetrics)[] = [
      'heapUsed',
      'heapTotal',
      'external',
      'rss',
      'timestamp',
    ];

    for (const field of requiredFields) {
      expect(metrics).toHaveProperty(field);
    }
  });
});
