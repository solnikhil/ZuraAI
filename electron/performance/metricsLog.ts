/**
 * Performance Metrics Log Module
 * 
 * This module implements a rolling log for performance metrics with a 100 entry limit.
 * Metrics are persisted to the userData directory for analysis across sessions.
 * 
 * **Validates: Requirement 6.4**
 * WHEN performance metrics are collected, THE Main_Process SHALL store them in a 
 * rolling log of the last 100 sessions
 */

import { app } from 'electron';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import type { PerformanceMetrics } from './monitor';

/**
 * A single entry in the metrics log
 */
export interface MetricsLogEntry {
  /** Unique identifier for the session */
  sessionId: string;
  /** Timestamp when the metrics were recorded */
  timestamp: number;
  /** The performance metrics snapshot */
  metrics: PerformanceMetrics;
  /** Any warnings generated during this session */
  warnings: string[];
}

/**
 * The complete metrics log structure
 */
export interface MetricsLog {
  /** Array of log entries */
  entries: MetricsLogEntry[];
  /** Maximum number of entries to retain (default: 100) */
  maxEntries: number;
}

/**
 * Default maximum entries for the rolling log
 */
const DEFAULT_MAX_ENTRIES = 100;

/**
 * In-memory cache for the metrics log
 */
let cachedLog: MetricsLog | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5000; // 5 second cache for metrics log

/**
 * Get the path to the metrics log file in userData directory
 */
function getMetricsLogPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'performance-metrics.json');
}

/**
 * Read the metrics log from disk (async)
 */
async function readMetricsLogAsync(): Promise<MetricsLog> {
  // Return cached data if fresh
  if (cachedLog && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedLog;
  }

  const filePath = getMetricsLogPath();
  try {
    const exists = fsSync.existsSync(filePath);
    if (exists) {
      const data = await fs.readFile(filePath, 'utf-8');
      cachedLog = JSON.parse(data);
      cacheTimestamp = Date.now();
      return cachedLog!;
    }
  } catch (error) {
    console.error('[MetricsLog] Failed to read metrics log:', error);
  }
  
  // Return default empty log
  return { entries: [], maxEntries: DEFAULT_MAX_ENTRIES };
}

/**
 * Read the metrics log from disk (sync - for initialization)
 */
function readMetricsLogSync(): MetricsLog {
  if (cachedLog && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedLog;
  }

  const filePath = getMetricsLogPath();
  try {
    if (fsSync.existsSync(filePath)) {
      const data = fsSync.readFileSync(filePath, 'utf-8');
      cachedLog = JSON.parse(data);
      cacheTimestamp = Date.now();
      return cachedLog!;
    }
  } catch (error) {
    console.error('[MetricsLog] Failed to read metrics log (sync):', error);
  }
  
  return { entries: [], maxEntries: DEFAULT_MAX_ENTRIES };
}

/**
 * Write the metrics log to disk (async)
 */
async function writeMetricsLogAsync(log: MetricsLog): Promise<void> {
  const filePath = getMetricsLogPath();
  try {
    const dir = path.dirname(filePath);
    if (!fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(filePath, JSON.stringify(log, null, 2), 'utf-8');
    // Update cache
    cachedLog = log;
    cacheTimestamp = Date.now();
  } catch (error) {
    console.error('[MetricsLog] Failed to write metrics log:', error);
  }
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `session-${timestamp}-${random}`;
}

/**
 * MetricsLogger class for managing the rolling performance metrics log
 * 
 * This class provides:
 * - Rolling log with configurable max entries (default: 100)
 * - Automatic removal of oldest entries when limit is exceeded
 * - Persistence to userData directory
 * - Session-based metrics tracking
 */
export class MetricsLogger {
  private currentSessionId: string;
  private maxEntries: number;

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
    this.currentSessionId = generateSessionId();
    console.log(`[MetricsLog] Initialized with session ID: ${this.currentSessionId}`);
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string {
    return this.currentSessionId;
  }

  /**
   * Add a new metrics entry to the log
   * Implements rolling log behavior - removes oldest entries when limit is exceeded
   * 
   * @param metrics - The performance metrics to log
   * @param warnings - Any warnings associated with this metrics snapshot
   */
  async addEntry(metrics: PerformanceMetrics, warnings: string[] = []): Promise<void> {
    const log = await readMetricsLogAsync();
    
    const entry: MetricsLogEntry = {
      sessionId: this.currentSessionId,
      timestamp: Date.now(),
      metrics,
      warnings,
    };

    // Add new entry
    log.entries.push(entry);

    // Enforce rolling log limit - remove oldest entries if exceeded
    while (log.entries.length > this.maxEntries) {
      log.entries.shift(); // Remove oldest entry
    }

    // Persist to disk
    await writeMetricsLogAsync(log);
    
    console.log(`[MetricsLog] Added entry (total: ${log.entries.length}/${this.maxEntries})`);
  }

  /**
   * Add a new metrics entry synchronously (for shutdown scenarios)
   * 
   * @param metrics - The performance metrics to log
   * @param warnings - Any warnings associated with this metrics snapshot
   */
  addEntrySync(metrics: PerformanceMetrics, warnings: string[] = []): void {
    const log = readMetricsLogSync();
    
    const entry: MetricsLogEntry = {
      sessionId: this.currentSessionId,
      timestamp: Date.now(),
      metrics,
      warnings,
    };

    log.entries.push(entry);

    // Enforce rolling log limit
    while (log.entries.length > this.maxEntries) {
      log.entries.shift();
    }

    // Write synchronously
    const filePath = getMetricsLogPath();
    try {
      const dir = path.dirname(filePath);
      if (!fsSync.existsSync(dir)) {
        fsSync.mkdirSync(dir, { recursive: true });
      }
      fsSync.writeFileSync(filePath, JSON.stringify(log, null, 2), 'utf-8');
      cachedLog = log;
      cacheTimestamp = Date.now();
    } catch (error) {
      console.error('[MetricsLog] Failed to write metrics log (sync):', error);
    }
  }

  /**
   * Get all entries from the metrics log
   */
  async getEntries(): Promise<MetricsLogEntry[]> {
    const log = await readMetricsLogAsync();
    return log.entries;
  }

  /**
   * Get entries for the current session only
   */
  async getCurrentSessionEntries(): Promise<MetricsLogEntry[]> {
    const entries = await this.getEntries();
    return entries.filter(entry => entry.sessionId === this.currentSessionId);
  }

  /**
   * Get the most recent N entries
   * 
   * @param count - Number of entries to retrieve
   */
  async getRecentEntries(count: number): Promise<MetricsLogEntry[]> {
    const entries = await this.getEntries();
    return entries.slice(-count);
  }

  /**
   * Get entries within a time range
   * 
   * @param startTime - Start timestamp (inclusive)
   * @param endTime - End timestamp (inclusive)
   */
  async getEntriesInRange(startTime: number, endTime: number): Promise<MetricsLogEntry[]> {
    const entries = await this.getEntries();
    return entries.filter(
      entry => entry.timestamp >= startTime && entry.timestamp <= endTime
    );
  }

  /**
   * Get entries that have warnings
   */
  async getEntriesWithWarnings(): Promise<MetricsLogEntry[]> {
    const entries = await this.getEntries();
    return entries.filter(entry => entry.warnings.length > 0);
  }

  /**
   * Get the total number of entries in the log
   */
  async getEntryCount(): Promise<number> {
    const log = await readMetricsLogAsync();
    return log.entries.length;
  }

  /**
   * Clear all entries from the log
   */
  async clearLog(): Promise<void> {
    const log: MetricsLog = { entries: [], maxEntries: this.maxEntries };
    await writeMetricsLogAsync(log);
    console.log('[MetricsLog] Log cleared');
  }

  /**
   * Get the maximum entries limit
   */
  getMaxEntries(): number {
    return this.maxEntries;
  }

  /**
   * Update the maximum entries limit
   * If current entries exceed new limit, oldest entries will be removed
   * 
   * @param maxEntries - New maximum entries limit
   */
  async setMaxEntries(maxEntries: number): Promise<void> {
    this.maxEntries = maxEntries;
    const log = await readMetricsLogAsync();
    log.maxEntries = maxEntries;

    // Trim if necessary
    while (log.entries.length > maxEntries) {
      log.entries.shift();
    }

    await writeMetricsLogAsync(log);
    console.log(`[MetricsLog] Max entries updated to ${maxEntries}`);
  }

  /**
   * Get statistics about the metrics log
   */
  async getStatistics(): Promise<{
    totalEntries: number;
    maxEntries: number;
    oldestEntry: number | null;
    newestEntry: number | null;
    uniqueSessions: number;
    entriesWithWarnings: number;
  }> {
    const entries = await this.getEntries();
    const uniqueSessions = new Set(entries.map(e => e.sessionId)).size;
    const entriesWithWarnings = entries.filter(e => e.warnings.length > 0).length;

    return {
      totalEntries: entries.length,
      maxEntries: this.maxEntries,
      oldestEntry: entries.length > 0 ? entries[0].timestamp : null,
      newestEntry: entries.length > 0 ? entries[entries.length - 1].timestamp : null,
      uniqueSessions,
      entriesWithWarnings,
    };
  }

  /**
   * Start a new session (generates new session ID)
   */
  startNewSession(): string {
    this.currentSessionId = generateSessionId();
    console.log(`[MetricsLog] Started new session: ${this.currentSessionId}`);
    return this.currentSessionId;
  }
}

// Singleton instance for the application
export const metricsLogger = new MetricsLogger(DEFAULT_MAX_ENTRIES);

/**
 * Get the path to the metrics log file
 */
export function getMetricsLogFilePath(): string {
  return getMetricsLogPath();
}
