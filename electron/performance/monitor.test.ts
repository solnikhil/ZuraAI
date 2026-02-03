/**
 * Performance Monitor Tests
 * 
 * Tests for the unified performance monitoring module that combines
 * startup timing, memory usage, and IPC metrics.
 * 
 * **Validates: Requirements 6.1, 6.2**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PerformanceMonitor,
  performanceMonitor,
  initializePerformanceMonitoring,
  getPerformanceSummary,
  type PerformanceMetrics,
} from './monitor';
import { deferredInitializer } from '../startup/deferredInit';

// Mock the deferredInitializer
vi.mock('../startup/deferredInit', () => ({
  deferredInitializer: {
    recordPhase: vi.fn(),
    getMetrics: vi.fn(() => ({
      processStartAt: 1000,
      appReadyAt: 1100,
      windowCreatedAt: 1200,
      windowVisibleAt: 1400,
      ipcReadyAt: 1300,
      fullyLoadedAt: 2000,
      phases: {},
    })),
  },
}));

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
    vi.clearAllMocks();
  });

  describe('recordStartupPhase', () => {
    it('should record start of a phase', () => {
      monitor.recordStartupPhase('test-phase');
      
      expect(deferredInitializer.recordPhase).toHaveBeenCalledWith('test-phase', 'start');
      
      const phases = monitor.getStartupPhases();
      expect(phases.has('test-phase')).toBe(true);
      expect(phases.get('test-phase')?.startedAt).toBeGreaterThan(0);
      expect(phases.get('test-phase')?.completedAt).toBeUndefined();
    });

    it('should record end of a phase on second call', () => {
      monitor.recordStartupPhase('test-phase');
      monitor.recordStartupPhase('test-phase');
      
      expect(deferredInitializer.recordPhase).toHaveBeenCalledWith('test-phase', 'start');
      expect(deferredInitializer.recordPhase).toHaveBeenCalledWith('test-phase', 'end');
      
      const phases = monitor.getStartupPhases();
      expect(phases.get('test-phase')?.completedAt).toBeGreaterThan(0);
    });

    it('should not record third call for same phase', () => {
      monitor.recordStartupPhase('test-phase');
      monitor.recordStartupPhase('test-phase');
      monitor.recordStartupPhase('test-phase');
      
      // Should only have 2 calls (start and end)
      expect(deferredInitializer.recordPhase).toHaveBeenCalledTimes(2);
    });
  });

  describe('recordIPCCall', () => {
    it('should track IPC call count', () => {
      monitor.recordIPCCall(10);
      monitor.recordIPCCall(20);
      monitor.recordIPCCall(30);
      
      const metrics = monitor.getMetrics();
      expect(metrics.ipc.callCount).toBe(3);
    });

    it('should calculate average latency', () => {
      monitor.recordIPCCall(10);
      monitor.recordIPCCall(20);
      monitor.recordIPCCall(30);
      
      const metrics = monitor.getMetrics();
      expect(metrics.ipc.averageLatency).toBe(20); // (10 + 20 + 30) / 3
    });

    it('should track batched calls', () => {
      monitor.recordIPCCall(10, false);
      monitor.recordIPCCall(20, true);
      monitor.recordIPCCall(30, true);
      
      const metrics = monitor.getMetrics();
      expect(metrics.ipc.batchedCalls).toBe(2);
    });
  });

  describe('getMetrics', () => {
    it('should return complete performance metrics', () => {
      const metrics = monitor.getMetrics();
      
      // Check startup metrics
      expect(metrics.startup).toBeDefined();
      expect(metrics.startup.windowCreated).toBe(200); // 1200 - 1000
      expect(metrics.startup.windowVisible).toBe(400); // 1400 - 1000
      expect(metrics.startup.ipcReady).toBe(300); // 1300 - 1000
      expect(metrics.startup.fullyLoaded).toBe(1000); // 2000 - 1000
      
      // Check memory metrics
      expect(metrics.memory).toBeDefined();
      expect(metrics.memory.heapUsed).toBeGreaterThan(0);
      expect(metrics.memory.heapTotal).toBeGreaterThan(0);
      expect(metrics.memory.rss).toBeGreaterThan(0);
      
      // Check IPC metrics
      expect(metrics.ipc).toBeDefined();
      expect(metrics.ipc.callCount).toBe(0);
      expect(metrics.ipc.averageLatency).toBe(0);
      expect(metrics.ipc.batchedCalls).toBe(0);
      
      // Check timestamp
      expect(metrics.timestamp).toBeGreaterThan(0);
    });

    it('should return metrics matching PerformanceMetrics interface', () => {
      const metrics: PerformanceMetrics = monitor.getMetrics();
      
      // Verify all required fields exist
      expect(typeof metrics.startup.windowCreated).toBe('number');
      expect(typeof metrics.startup.windowVisible).toBe('number');
      expect(typeof metrics.startup.ipcReady).toBe('number');
      expect(typeof metrics.startup.fullyLoaded).toBe('number');
      
      expect(typeof metrics.memory.heapUsed).toBe('number');
      expect(typeof metrics.memory.heapTotal).toBe('number');
      expect(typeof metrics.memory.external).toBe('number');
      expect(typeof metrics.memory.rss).toBe('number');
      expect(typeof metrics.memory.timestamp).toBe('number');
      
      expect(typeof metrics.ipc.callCount).toBe('number');
      expect(typeof metrics.ipc.averageLatency).toBe('number');
      expect(typeof metrics.ipc.batchedCalls).toBe('number');
      
      expect(typeof metrics.timestamp).toBe('number');
    });
  });

  describe('checkThresholds', () => {
    it('should return empty warnings when within thresholds', () => {
      // Default thresholds: startup 2000ms, memory 800MB
      // Mock returns windowVisible at 400ms which is within threshold
      const { warnings } = monitor.checkThresholds();
      
      // Startup is within threshold (400ms < 2000ms)
      // Memory depends on actual usage, but typically under 800MB in tests
      expect(warnings.filter(w => w.includes('Startup'))).toHaveLength(0);
    });

    it('should return warning when startup exceeds threshold', () => {
      // Create monitor with low startup threshold
      const strictMonitor = new PerformanceMonitor({
        startupWarningMs: 100, // Very low threshold
      });
      
      const { warnings } = strictMonitor.checkThresholds();
      
      // windowVisible is 400ms which exceeds 100ms threshold
      expect(warnings.some(w => w.includes('Startup'))).toBe(true);
    });

    it('should return warning when memory exceeds threshold', () => {
      // Create monitor with very low memory threshold
      const strictMonitor = new PerformanceMonitor({
        memoryWarningMB: 0.001, // Impossibly low threshold
      });
      
      const { warnings } = strictMonitor.checkThresholds();
      
      expect(warnings.some(w => w.includes('Memory'))).toBe(true);
    });
  });

  describe('logMetrics', () => {
    it('should log metrics without throwing', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      expect(() => monitor.logMetrics()).not.toThrow();
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('threshold configuration', () => {
    it('should use default thresholds', () => {
      const thresholds = monitor.getThresholds();
      
      expect(thresholds.startupWarningMs).toBe(2000);
      expect(thresholds.memoryWarningMB).toBe(800);
    });

    it('should allow custom thresholds', () => {
      const customMonitor = new PerformanceMonitor({
        startupWarningMs: 1500,
        memoryWarningMB: 600,
      });
      
      const thresholds = customMonitor.getThresholds();
      
      expect(thresholds.startupWarningMs).toBe(1500);
      expect(thresholds.memoryWarningMB).toBe(600);
    });

    it('should update thresholds', () => {
      monitor.updateThresholds({ startupWarningMs: 3000 });
      
      const thresholds = monitor.getThresholds();
      
      expect(thresholds.startupWarningMs).toBe(3000);
      expect(thresholds.memoryWarningMB).toBe(800); // Unchanged
    });
  });

  describe('reset methods', () => {
    it('should reset IPC metrics', () => {
      monitor.recordIPCCall(10);
      monitor.recordIPCCall(20, true);
      
      let metrics = monitor.getMetrics();
      expect(metrics.ipc.callCount).toBe(2);
      expect(metrics.ipc.batchedCalls).toBe(1);
      
      monitor.resetIPCMetrics();
      
      metrics = monitor.getMetrics();
      expect(metrics.ipc.callCount).toBe(0);
      expect(metrics.ipc.averageLatency).toBe(0);
      expect(metrics.ipc.batchedCalls).toBe(0);
    });

    it('should reset startup phases', () => {
      monitor.recordStartupPhase('test-phase');
      
      let phases = monitor.getStartupPhases();
      expect(phases.size).toBe(1);
      
      monitor.resetStartupPhases();
      
      phases = monitor.getStartupPhases();
      expect(phases.size).toBe(0);
    });
  });
});

describe('Singleton instance', () => {
  it('should export a singleton performanceMonitor', () => {
    expect(performanceMonitor).toBeInstanceOf(PerformanceMonitor);
  });
});

describe('Helper functions', () => {
  describe('initializePerformanceMonitoring', () => {
    it('should initialize without throwing', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      expect(() => initializePerformanceMonitoring()).not.toThrow();
      
      consoleSpy.mockRestore();
    });
  });

  describe('getPerformanceSummary', () => {
    it('should return a summary object', () => {
      const summary = getPerformanceSummary();
      
      expect(typeof summary.startupMs).toBe('number');
      expect(typeof summary.memoryMB).toBe('number');
      expect(typeof summary.ipcCalls).toBe('number');
      expect(Array.isArray(summary.warnings)).toBe(true);
    });
  });
});

describe('PerformanceMetrics interface compliance', () => {
  it('should match the design document interface', () => {
    const monitor = new PerformanceMonitor();
    const metrics = monitor.getMetrics();
    
    // Verify startup metrics structure
    expect(metrics.startup).toHaveProperty('windowCreated');
    expect(metrics.startup).toHaveProperty('windowVisible');
    expect(metrics.startup).toHaveProperty('ipcReady');
    expect(metrics.startup).toHaveProperty('fullyLoaded');
    
    // Verify memory metrics structure
    expect(metrics.memory).toHaveProperty('heapUsed');
    expect(metrics.memory).toHaveProperty('heapTotal');
    expect(metrics.memory).toHaveProperty('external');
    expect(metrics.memory).toHaveProperty('rss');
    
    // Verify IPC metrics structure
    expect(metrics.ipc).toHaveProperty('callCount');
    expect(metrics.ipc).toHaveProperty('averageLatency');
    expect(metrics.ipc).toHaveProperty('batchedCalls');
  });
});
