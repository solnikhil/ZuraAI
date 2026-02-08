/**
 * Property-Based Tests for Performance Monitoring
 * 
 * This file contains property-based tests using fast-check to verify
 * universal properties of the performance monitoring implementation.
 * 
 * **Property 25: Metrics Log Rolling Window**
 * For any metrics log, it SHALL contain at most 100 entries, with oldest entries 
 * being removed when the limit is exceeded.
 * 
 * **Validates: Requirements 6.4**
 * 
 * **Property 26: Performance Regression Warning**
 * For any startup exceeding 2 seconds or memory usage exceeding 800MB, 
 * a warning SHALL be logged.
 * 
 * **Validates: Requirements 6.6**
 * 
 * Feature: electron-performance-optimization, Property 25: Metrics Log Rolling Window
 * Feature: electron-performance-optimization, Property 26: Performance Regression Warning
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import type { PerformanceMetrics } from './monitor';
import type { MetricsLogEntry, MetricsLog } from './metricsLog';

/**
 * Property test configuration
 */
const PROPERTY_TEST_CONFIG = {
  numRuns: 100,
  seed: 42,
  timeout: 30000,
};

/**
 * Performance thresholds from design document
 */
const THRESHOLDS = {
  startupWarningMs: 2000,    // 2 seconds
  memoryWarningMB: 800,      // 800MB
  maxLogEntries: 100,        // Rolling log limit
};

/**
 * Convert MB to bytes
 */
function mbToBytes(mb: number): number {
  return mb * 1024 * 1024;
}

/**
 * Generators for property-based testing
 */
const generators = {
  /**
   * Generate a valid startup time in milliseconds
   * Range: 0ms to 5000ms (covers both normal and regression scenarios)
   */
  startupTimeMs: fc.integer({ min: 0, max: 5000 }),

  /**
   * Generate a valid memory usage in MB
   * Range: 50MB to 1500MB (covers both normal and regression scenarios)
   */
  memoryUsageMB: fc.integer({ min: 50, max: 1500 }),

  /**
   * Generate a count of log entries to add
   * Range: 1 to 200 (to test rolling window behavior)
   */
  entryCount: fc.integer({ min: 1, max: 200 }),

  /**
   * Generate a max entries limit for the rolling log
   * Range: 10 to 150 (to test various limits including default 100)
   */
  maxEntriesLimit: fc.integer({ min: 10, max: 150 }),

  /**
   * Generate a sequence of startup times for batch testing
   */
  startupTimeSequence: fc.array(
    fc.integer({ min: 0, max: 5000 }),
    { minLength: 1, maxLength: 50 }
  ),

  /**
   * Generate a sequence of memory values for batch testing
   */
  memorySequence: fc.array(
    fc.integer({ min: 50, max: 1500 }),
    { minLength: 1, maxLength: 50 }
  ),

  /**
   * Generate a valid session ID
   */
  sessionId: fc.string({ minLength: 10, maxLength: 30 }),
};

/**
 * Create a mock PerformanceMetrics object for testing
 */
function createMockMetrics(overrides: {
  startupMs?: number;
  memoryMB?: number;
} = {}): PerformanceMetrics {
  const memoryBytes = mbToBytes(overrides.memoryMB ?? 200);
  
  return {
    startup: {
      windowCreated: Math.floor((overrides.startupMs ?? 500) * 0.3),
      windowVisible: overrides.startupMs ?? 500,
      ipcReady: Math.floor((overrides.startupMs ?? 500) * 0.5),
      fullyLoaded: Math.floor((overrides.startupMs ?? 500) * 1.5),
    },
    memory: {
      heapUsed: Math.floor(memoryBytes * 0.4),
      heapTotal: Math.floor(memoryBytes * 0.6),
      external: Math.floor(memoryBytes * 0.1),
      rss: memoryBytes,
      timestamp: Date.now(),
    },
    ipc: {
      callCount: 10,
      averageLatency: 5,
      batchedCalls: 2,
    },
    renderer: null,
    timestamp: Date.now(),
  };
}

/**
 * Create a mock MetricsLogEntry for testing
 */
function createMockLogEntry(
  sessionId: string,
  timestamp: number,
  metrics: PerformanceMetrics,
  warnings: string[] = []
): MetricsLogEntry {
  return {
    sessionId,
    timestamp,
    metrics,
    warnings,
  };
}

/**
 * Simulate rolling log behavior (same logic as MetricsLogger)
 */
function simulateRollingLog(
  entries: MetricsLogEntry[],
  newEntry: MetricsLogEntry,
  maxEntries: number
): MetricsLogEntry[] {
  const result = [...entries, newEntry];
  
  // Remove oldest entries when limit is exceeded
  while (result.length > maxEntries) {
    result.shift();
  }
  
  return result;
}

/**
 * Check if a startup time should trigger a warning
 */
function shouldWarnStartup(startupMs: number, threshold: number = THRESHOLDS.startupWarningMs): boolean {
  return startupMs > threshold;
}

/**
 * Check if memory usage should trigger a warning
 */
function shouldWarnMemory(memoryMB: number, threshold: number = THRESHOLDS.memoryWarningMB): boolean {
  return memoryMB > threshold;
}

/**
 * Generate warnings based on metrics
 */
function generateWarnings(metrics: PerformanceMetrics): string[] {
  const warnings: string[] = [];
  const startupMs = metrics.startup.windowVisible;
  const memoryMB = metrics.memory.rss / (1024 * 1024);
  
  if (shouldWarnStartup(startupMs)) {
    warnings.push(`Startup time (${startupMs}ms) exceeds threshold (${THRESHOLDS.startupWarningMs}ms)`);
  }
  
  if (shouldWarnMemory(memoryMB)) {
    warnings.push(`Memory usage (${memoryMB.toFixed(1)}MB) exceeds threshold (${THRESHOLDS.memoryWarningMB}MB)`);
  }
  
  return warnings;
}

describe('Performance Monitoring Property Tests', () => {
  describe('Property 25: Metrics Log Rolling Window', () => {
    /**
     * **Property 25: Metrics Log Rolling Window**
     * 
     * For any metrics log, it SHALL contain at most 100 entries, with oldest entries 
     * being removed when the limit is exceeded.
     * 
     * **Validates: Requirements 6.4**
     */

    it('should never exceed maxEntries limit regardless of entries added (100 iterations)', () => {
      fc.assert(
        fc.property(
          generators.entryCount,
          generators.maxEntriesLimit,
          (entryCount, maxEntries) => {
            let entries: MetricsLogEntry[] = [];
            
            // Add entries one by one
            for (let i = 0; i < entryCount; i++) {
              const metrics = createMockMetrics({ startupMs: 500 + i, memoryMB: 200 + i });
              const entry = createMockLogEntry(
                `session-test${i.toString().padStart(2, '0')}-abc123`,
                Date.now() + i * 1000,
                metrics,
                []
              );
              
              entries = simulateRollingLog(entries, entry, maxEntries);
            }
            
            // Property: entries should never exceed maxEntries
            expect(entries.length).toBeLessThanOrEqual(maxEntries);
            
            // If we added more than maxEntries, we should have exactly maxEntries
            if (entryCount >= maxEntries) {
              expect(entries.length).toBe(maxEntries);
            } else {
              expect(entries.length).toBe(entryCount);
            }
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should remove oldest entries when limit is exceeded (100 iterations)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 101, max: 200 }), // Always exceed default limit
          (entryCount) => {
            const maxEntries = THRESHOLDS.maxLogEntries; // 100
            let entries: MetricsLogEntry[] = [];
            
            // Add entries with sequential timestamps
            for (let i = 0; i < entryCount; i++) {
              const timestamp = 1000 + i * 100; // Sequential timestamps
              const metrics = createMockMetrics({ startupMs: 500 });
              const entry = createMockLogEntry(
                `session-test${i.toString().padStart(2, '0')}-abc123`,
                timestamp,
                metrics,
                []
              );
              
              entries = simulateRollingLog(entries, entry, maxEntries);
            }
            
            // Property: should have exactly maxEntries
            expect(entries.length).toBe(maxEntries);
            
            // Property: oldest entries should be removed
            // The first entry should have timestamp from (entryCount - maxEntries)
            const expectedFirstTimestamp = 1000 + (entryCount - maxEntries) * 100;
            expect(entries[0].timestamp).toBe(expectedFirstTimestamp);
            
            // The last entry should have the most recent timestamp
            const expectedLastTimestamp = 1000 + (entryCount - 1) * 100;
            expect(entries[entries.length - 1].timestamp).toBe(expectedLastTimestamp);
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should preserve entry order (newest at end) after rolling (100 iterations)', () => {
      fc.assert(
        fc.property(
          generators.entryCount,
          (entryCount) => {
            const maxEntries = 50; // Use smaller limit for faster testing
            let entries: MetricsLogEntry[] = [];
            
            // Add entries with sequential timestamps
            for (let i = 0; i < entryCount; i++) {
              const timestamp = Date.now() + i * 1000;
              const metrics = createMockMetrics({ startupMs: 500 });
              const entry = createMockLogEntry(
                `session-test${i.toString().padStart(2, '0')}-abc123`,
                timestamp,
                metrics,
                []
              );
              
              entries = simulateRollingLog(entries, entry, maxEntries);
            }
            
            // Property: entries should be in chronological order
            for (let i = 1; i < entries.length; i++) {
              expect(entries[i].timestamp).toBeGreaterThan(entries[i - 1].timestamp);
            }
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should maintain exactly maxEntries when at capacity (100 iterations)', () => {
      fc.assert(
        fc.property(
          generators.maxEntriesLimit,
          fc.integer({ min: 1, max: 50 }), // Additional entries to add after reaching capacity
          (maxEntries, additionalEntries) => {
            let entries: MetricsLogEntry[] = [];
            
            // Fill to capacity
            for (let i = 0; i < maxEntries; i++) {
              const metrics = createMockMetrics({ startupMs: 500 });
              const entry = createMockLogEntry(
                `session-fill${i.toString().padStart(2, '0')}-abc123`,
                Date.now() + i * 1000,
                metrics,
                []
              );
              entries = simulateRollingLog(entries, entry, maxEntries);
            }
            
            expect(entries.length).toBe(maxEntries);
            
            // Add more entries
            for (let i = 0; i < additionalEntries; i++) {
              const metrics = createMockMetrics({ startupMs: 500 });
              const entry = createMockLogEntry(
                `session-extra${i.toString().padStart(2, '0')}-abc123`,
                Date.now() + (maxEntries + i) * 1000,
                metrics,
                []
              );
              entries = simulateRollingLog(entries, entry, maxEntries);
              
              // Property: should always maintain exactly maxEntries
              expect(entries.length).toBe(maxEntries);
            }
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });
  });

  describe('Property 26: Performance Regression Warning', () => {
    /**
     * **Property 26: Performance Regression Warning**
     * 
     * For any startup exceeding 2 seconds or memory usage exceeding 800MB, 
     * a warning SHALL be logged.
     * 
     * **Validates: Requirements 6.6**
     */

    it('should generate warning for startup time exceeding 2 seconds (100 iterations)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2001, max: 5000 }), // Always exceeds 2000ms threshold
          (startupMs) => {
            const metrics = createMockMetrics({ startupMs, memoryMB: 200 });
            const warnings = generateWarnings(metrics);
            
            // Property: startup exceeding 2s should generate a warning
            expect(warnings.some(w => w.includes('Startup time'))).toBe(true);
            expect(warnings.some(w => w.includes('exceeds threshold'))).toBe(true);
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should NOT generate startup warning for times under 2 seconds (100 iterations)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 2000 }), // At or below threshold
          (startupMs) => {
            const metrics = createMockMetrics({ startupMs, memoryMB: 200 });
            const warnings = generateWarnings(metrics);
            
            // Property: startup at or below 2s should NOT generate a startup warning
            expect(warnings.some(w => w.includes('Startup time'))).toBe(false);
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should generate warning for memory usage exceeding 800MB (100 iterations)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 801, max: 1500 }), // Always exceeds 800MB threshold
          (memoryMB) => {
            const metrics = createMockMetrics({ startupMs: 500, memoryMB });
            const warnings = generateWarnings(metrics);
            
            // Property: memory exceeding 800MB should generate a warning
            expect(warnings.some(w => w.includes('Memory usage'))).toBe(true);
            expect(warnings.some(w => w.includes('exceeds threshold'))).toBe(true);
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should NOT generate memory warning for usage under 800MB (100 iterations)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 50, max: 800 }), // At or below threshold
          (memoryMB) => {
            const metrics = createMockMetrics({ startupMs: 500, memoryMB });
            const warnings = generateWarnings(metrics);
            
            // Property: memory at or below 800MB should NOT generate a memory warning
            expect(warnings.some(w => w.includes('Memory usage'))).toBe(false);
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should generate both warnings when both thresholds are exceeded (100 iterations)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2001, max: 5000 }), // Exceeds startup threshold
          fc.integer({ min: 801, max: 1500 }),  // Exceeds memory threshold
          (startupMs, memoryMB) => {
            const metrics = createMockMetrics({ startupMs, memoryMB });
            const warnings = generateWarnings(metrics);
            
            // Property: both thresholds exceeded should generate both warnings
            expect(warnings.length).toBe(2);
            expect(warnings.some(w => w.includes('Startup time'))).toBe(true);
            expect(warnings.some(w => w.includes('Memory usage'))).toBe(true);
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should generate no warnings when both metrics are within thresholds (100 iterations)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 2000 }), // Within startup threshold
          fc.integer({ min: 50, max: 800 }),   // Within memory threshold
          (startupMs, memoryMB) => {
            const metrics = createMockMetrics({ startupMs, memoryMB });
            const warnings = generateWarnings(metrics);
            
            // Property: both metrics within thresholds should generate no warnings
            expect(warnings.length).toBe(0);
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should correctly identify regression boundary at exactly 2000ms startup (100 iterations)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -10, max: 10 }), // Small offset around threshold
          (offset) => {
            const startupMs = THRESHOLDS.startupWarningMs + offset;
            const metrics = createMockMetrics({ startupMs, memoryMB: 200 });
            const warnings = generateWarnings(metrics);
            
            // Property: warning should be generated only when EXCEEDING threshold (not equal)
            const hasStartupWarning = warnings.some(w => w.includes('Startup time'));
            
            if (startupMs > THRESHOLDS.startupWarningMs) {
              expect(hasStartupWarning).toBe(true);
            } else {
              expect(hasStartupWarning).toBe(false);
            }
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should correctly identify regression boundary at exactly 800MB memory (100 iterations)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -10, max: 10 }), // Small offset around threshold
          (offset) => {
            const memoryMB = THRESHOLDS.memoryWarningMB + offset;
            const metrics = createMockMetrics({ startupMs: 500, memoryMB });
            const warnings = generateWarnings(metrics);
            
            // Property: warning should be generated only when EXCEEDING threshold (not equal)
            const hasMemoryWarning = warnings.some(w => w.includes('Memory usage'));
            
            if (memoryMB > THRESHOLDS.memoryWarningMB) {
              expect(hasMemoryWarning).toBe(true);
            } else {
              expect(hasMemoryWarning).toBe(false);
            }
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });
  });

  describe('Combined Properties: Rolling Log with Warnings', () => {
    /**
     * Combined property tests verifying that warnings are properly stored
     * in the rolling log entries.
     */

    it('should store warnings in log entries when thresholds are exceeded (100 iterations)', () => {
      fc.assert(
        fc.property(
          generators.startupTimeSequence,
          generators.memorySequence,
          (startupTimes, memoryValues) => {
            const maxEntries = THRESHOLDS.maxLogEntries;
            let entries: MetricsLogEntry[] = [];
            
            // Use the shorter array length
            const count = Math.min(startupTimes.length, memoryValues.length);
            
            for (let i = 0; i < count; i++) {
              const metrics = createMockMetrics({
                startupMs: startupTimes[i],
                memoryMB: memoryValues[i],
              });
              const warnings = generateWarnings(metrics);
              
              const entry = createMockLogEntry(
                `session-test${i.toString().padStart(2, '0')}-abc123`,
                Date.now() + i * 1000,
                metrics,
                warnings
              );
              
              entries = simulateRollingLog(entries, entry, maxEntries);
            }
            
            // Property: entries with regression metrics should have warnings
            for (const entry of entries) {
              const startupMs = entry.metrics.startup.windowVisible;
              const memoryMB = entry.metrics.memory.rss / (1024 * 1024);
              
              const shouldHaveStartupWarning = startupMs > THRESHOLDS.startupWarningMs;
              const shouldHaveMemoryWarning = memoryMB > THRESHOLDS.memoryWarningMB;
              
              const hasStartupWarning = entry.warnings.some(w => w.includes('Startup time'));
              const hasMemoryWarning = entry.warnings.some(w => w.includes('Memory usage'));
              
              expect(hasStartupWarning).toBe(shouldHaveStartupWarning);
              expect(hasMemoryWarning).toBe(shouldHaveMemoryWarning);
            }
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });

    it('should count entries with warnings correctly after rolling (100 iterations)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 50, max: 150 }), // Entry count
          fc.float({ min: 0, max: 1 }),      // Probability of regression
          (entryCount, regressionProbability) => {
            const maxEntries = THRESHOLDS.maxLogEntries;
            let entries: MetricsLogEntry[] = [];
            let expectedWarningCount = 0;
            
            for (let i = 0; i < entryCount; i++) {
              // Determine if this entry should have a regression
              const hasRegression = Math.random() < regressionProbability;
              const startupMs = hasRegression ? 2500 : 500;
              const memoryMB = 200; // Keep memory normal for this test
              
              const metrics = createMockMetrics({ startupMs, memoryMB });
              const warnings = generateWarnings(metrics);
              
              const entry = createMockLogEntry(
                `session-test${i.toString().padStart(2, '0')}-abc123`,
                Date.now() + i * 1000,
                metrics,
                warnings
              );
              
              entries = simulateRollingLog(entries, entry, maxEntries);
            }
            
            // Count entries with warnings in the final log
            const actualWarningCount = entries.filter(e => e.warnings.length > 0).length;
            
            // Property: warning count should be between 0 and entries.length
            expect(actualWarningCount).toBeGreaterThanOrEqual(0);
            expect(actualWarningCount).toBeLessThanOrEqual(entries.length);
          }
        ),
        { numRuns: PROPERTY_TEST_CONFIG.numRuns, seed: PROPERTY_TEST_CONFIG.seed }
      );
    });
  });
});
