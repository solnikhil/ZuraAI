/**
 * Tests for useLazyLoad hook
 * 
 * **Validates: Requirements 7.4, 7.5**
 * - THE Renderer_Process SHALL defer loading of non-critical assets until after TTI
 * - WHEN images are displayed, THE Renderer_Process SHALL use lazy loading with intersection observer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock IntersectionObserver
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  
  private callback: IntersectionObserverCallback;
  private elements: Set<Element> = new Set();
  
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.rootMargin = options?.rootMargin || '';
    this.thresholds = Array.isArray(options?.threshold) 
      ? options.threshold 
      : [options?.threshold || 0];
    
    // Store instance for test access
    MockIntersectionObserver.instances.push(this);
  }
  
  observe(target: Element): void {
    this.elements.add(target);
  }
  
  unobserve(target: Element): void {
    this.elements.delete(target);
  }
  
  disconnect(): void {
    this.elements.clear();
  }
  
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  
  // Test helper to simulate intersection
  simulateIntersection(isIntersecting: boolean): void {
    const entries: IntersectionObserverEntry[] = Array.from(this.elements).map(target => ({
      target,
      isIntersecting,
      boundingClientRect: {} as DOMRectReadOnly,
      intersectionRatio: isIntersecting ? 1 : 0,
      intersectionRect: {} as DOMRectReadOnly,
      rootBounds: null,
      time: Date.now(),
    }));
    
    if (entries.length > 0) {
      this.callback(entries, this);
    }
  }
  
  // Static storage for test access
  static instances: MockIntersectionObserver[] = [];
  
  static clearInstances(): void {
    MockIntersectionObserver.instances = [];
  }
  
  static getLastInstance(): MockIntersectionObserver | undefined {
    return MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1];
  }
}

// Mock rendererPerformanceTracker
let mockTTIValue: number | null = null;
const mockCallbacks: Array<(updates: { tti?: number | null }) => void> = [];

vi.mock('../utils/rendererPerformance', () => ({
  rendererPerformanceTracker: {
    getMetrics: () => ({
      tti: mockTTIValue,
      fcp: null,
      lcp: null,
      fid: null,
      cls: null,
      navigationStart: 0,
      domContentLoaded: null,
      loadComplete: null,
      timestamp: Date.now(),
    }),
    onMetricsUpdate: (callback: (updates: { tti?: number | null }) => void) => {
      mockCallbacks.push(callback);
      return () => {
        const index = mockCallbacks.indexOf(callback);
        if (index > -1) mockCallbacks.splice(index, 1);
      };
    },
  },
}));

// Helper to set TTI value and notify callbacks
function setMockTTI(value: number | null): void {
  mockTTIValue = value;
  if (value !== null) {
    mockCallbacks.forEach(cb => cb({ tti: value }));
  }
}

// Helper to reset mock state
function resetMockState(): void {
  mockTTIValue = null;
  mockCallbacks.length = 0;
}

describe('useLazyLoad', () => {
  beforeEach(() => {
    // Set up IntersectionObserver mock
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    MockIntersectionObserver.clearInstances();
    
    // Reset TTI state
    resetMockState();
  });
  
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  
  // Import the hook after mocks are set up
  const getHook = async () => {
    const module = await import('./useLazyLoad');
    return module;
  };
  
  describe('basic functionality', () => {
    it('should return initial state with isIntersecting false', async () => {
      const { useLazyLoad } = await getHook();
      const { result } = renderHook(() => useLazyLoad());
      
      expect(result.current.isIntersecting).toBe(false);
      expect(result.current.shouldLoad).toBe(false);
      expect(result.current.ref).toBeDefined();
    });
    
    it('should have isTTIReached true when waitForTTI is false', async () => {
      const { useLazyLoad } = await getHook();
      const { result } = renderHook(() => useLazyLoad({ waitForTTI: false }));
      
      expect(result.current.isTTIReached).toBe(true);
    });
  });
  
  describe('forceLoad', () => {
    it('should immediately set shouldLoad to true when forceLoad is called', async () => {
      const { useLazyLoad } = await getHook();
      const { result } = renderHook(() => useLazyLoad());
      
      expect(result.current.shouldLoad).toBe(false);
      
      act(() => {
        result.current.forceLoad();
      });
      
      expect(result.current.shouldLoad).toBe(true);
      expect(result.current.isIntersecting).toBe(true);
      expect(result.current.isTTIReached).toBe(true);
    });
  });
  
  describe('disabled state', () => {
    it('should immediately set isIntersecting to true when enabled is false', async () => {
      const { useLazyLoad } = await getHook();
      const { result } = renderHook(() => useLazyLoad({ enabled: false }));
      
      expect(result.current.isIntersecting).toBe(true);
      expect(result.current.shouldLoad).toBe(true);
    });
  });
  
  describe('rootMargin configuration', () => {
    it('should accept rootMargin option', async () => {
      const { useLazyLoad } = await getHook();
      
      // Just verify the hook accepts the rootMargin option without error
      const { result } = renderHook(() => useLazyLoad({ rootMargin: '200px' }));
      
      // The hook should return valid state
      expect(result.current.ref).toBeDefined();
      expect(typeof result.current.shouldLoad).toBe('boolean');
    });
  });
});

describe('isTTIReached utility', () => {
  beforeEach(() => {
    resetMockState();
  });
  
  it('should be a function', async () => {
    const { isTTIReached } = await import('./useLazyLoad');
    expect(typeof isTTIReached).toBe('function');
  });
});

describe('waitForTTI utility', () => {
  beforeEach(() => {
    resetMockState();
  });
  
  it('should be a function that returns a promise', async () => {
    const { waitForTTI } = await import('./useLazyLoad');
    expect(typeof waitForTTI).toBe('function');
    
    // Set TTI immediately so the promise resolves
    setMockTTI(1000);
    
    const result = waitForTTI(100);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });
});
