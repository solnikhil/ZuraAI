/**
 * Tests for LazyImage component
 * 
 * **Validates: Requirements 7.4, 7.5**
 * - THE Renderer_Process SHALL defer loading of non-critical assets until after TTI
 * - WHEN images are displayed, THE Renderer_Process SHALL use lazy loading with intersection observer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { LazyImage, injectLazyImageStyles } from './LazyImage';

// Mock useLazyLoad hook
vi.mock('../../hooks/useLazyLoad', () => ({
  useLazyLoad: vi.fn(() => ({
    ref: { current: null },
    isIntersecting: true,
    isTTIReached: true,
    shouldLoad: true,
    forceLoad: vi.fn(),
  })),
}));

describe('LazyImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('basic rendering', () => {
    it('should render an image with correct src and alt', () => {
      render(<LazyImage src="/test-image.jpg" alt="Test image" />);
      
      const img = screen.getByRole('img', { name: 'Test image' });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', '/test-image.jpg');
    });
    
    it('should render with custom className', () => {
      render(
        <LazyImage 
          src="/test-image.jpg" 
          alt="Test image" 
          className="custom-class"
        />
      );
      
      const img = screen.getByRole('img', { name: 'Test image' });
      expect(img).toHaveClass('custom-class');
    });
    
    it('should render with data attributes', () => {
      render(
        <LazyImage 
          src="/test-image.jpg" 
          alt="Test image" 
          data-testid="test-img"
        />
      );
      
      const img = screen.getByRole('img', { name: 'Test image' });
      expect(img).toHaveAttribute('data-testid', 'test-img');
    });
  });
  
  describe('placeholder rendering', () => {
    it('should render skeleton placeholder by default', () => {
      const { container } = render(
        <LazyImage src="/test-image.jpg" alt="Test image" />
      );
      
      // Skeleton placeholder should be present
      const placeholder = container.querySelector('[aria-hidden="true"]');
      expect(placeholder).toBeInTheDocument();
    });
    
    it('should render color placeholder when placeholderType is color', () => {
      const { container } = render(
        <LazyImage 
          src="/test-image.jpg" 
          alt="Test image" 
          placeholderType="color"
          placeholderColor="#ff0000"
        />
      );
      
      const placeholder = container.querySelector('[aria-hidden="true"]');
      expect(placeholder).toBeInTheDocument();
      expect(placeholder).toHaveStyle({ backgroundColor: '#ff0000' });
    });
    
    it('should render blur placeholder when placeholderType is blur and blurDataURL is provided', () => {
      const { container } = render(
        <LazyImage 
          src="/test-image.jpg" 
          alt="Test image" 
          placeholderType="blur"
          blurDataURL="/blur-image.jpg"
        />
      );
      
      const blurImg = container.querySelector('img[aria-hidden="true"]');
      expect(blurImg).toBeInTheDocument();
      expect(blurImg).toHaveAttribute('src', '/blur-image.jpg');
    });
    
    it('should render custom placeholder when placeholderType is custom', () => {
      render(
        <LazyImage 
          src="/test-image.jpg" 
          alt="Test image" 
          placeholderType="custom"
          placeholder={<div data-testid="custom-placeholder">Loading...</div>}
        />
      );
      
      expect(screen.getByTestId('custom-placeholder')).toBeInTheDocument();
    });
    
    it('should not render placeholder when placeholderType is none', () => {
      const { container } = render(
        <LazyImage 
          src="/test-image.jpg" 
          alt="Test image" 
          placeholderType="none"
        />
      );
      
      const placeholder = container.querySelector('[aria-hidden="true"]');
      expect(placeholder).not.toBeInTheDocument();
    });
  });
  
  describe('loading states', () => {
    it('should call onLoadStart when image starts loading', () => {
      const onLoadStart = vi.fn();
      
      render(
        <LazyImage 
          src="/test-image.jpg" 
          alt="Test image" 
          onLoadStart={onLoadStart}
        />
      );
      
      expect(onLoadStart).toHaveBeenCalled();
    });
    
    it('should call onLoad when image finishes loading', () => {
      const onLoad = vi.fn();
      
      render(
        <LazyImage 
          src="/test-image.jpg" 
          alt="Test image" 
          onLoad={onLoad}
        />
      );
      
      const img = screen.getByRole('img', { name: 'Test image' });
      fireEvent.load(img);
      
      expect(onLoad).toHaveBeenCalled();
    });
    
    it('should call onError when image fails to load', () => {
      const onError = vi.fn();
      
      render(
        <LazyImage 
          src="/test-image.jpg" 
          alt="Test image" 
          onError={onError}
        />
      );
      
      const img = screen.getByRole('img', { name: 'Test image' });
      fireEvent.error(img);
      
      expect(onError).toHaveBeenCalled();
    });
    
    it('should render fallback when image fails to load', () => {
      render(
        <LazyImage 
          src="/test-image.jpg" 
          alt="Test image" 
          fallback={<div data-testid="fallback">Failed to load</div>}
        />
      );
      
      const img = screen.getByRole('img', { name: 'Test image' });
      fireEvent.error(img);
      
      expect(screen.getByTestId('fallback')).toBeInTheDocument();
    });
  });
  
  describe('native lazy loading', () => {
    it('should use native loading="lazy" when useNativeLazy is true', () => {
      render(
        <LazyImage 
          src="/test-image.jpg" 
          alt="Test image" 
          useNativeLazy={true}
        />
      );
      
      const img = screen.getByRole('img', { name: 'Test image' });
      expect(img).toHaveAttribute('loading', 'lazy');
    });
    
    it('should not have loading attribute when useNativeLazy is false', () => {
      render(
        <LazyImage 
          src="/test-image.jpg" 
          alt="Test image" 
          useNativeLazy={false}
        />
      );
      
      const img = screen.getByRole('img', { name: 'Test image' });
      expect(img).not.toHaveAttribute('loading');
    });
  });
  
  describe('dimensions and aspect ratio', () => {
    it('should apply width and height to container', () => {
      const { container } = render(
        <LazyImage 
          src="/test-image.jpg" 
          alt="Test image" 
          width={200}
          height={150}
        />
      );
      
      const containerDiv = container.firstChild as HTMLElement;
      expect(containerDiv).toHaveStyle({ width: '200px', height: '150px' });
    });
    
    it('should apply aspectRatio to container', () => {
      const { container } = render(
        <LazyImage 
          src="/test-image.jpg" 
          alt="Test image" 
          aspectRatio="16/9"
        />
      );
      
      const containerDiv = container.firstChild as HTMLElement;
      expect(containerDiv).toHaveStyle({ aspectRatio: '16/9' });
    });
    
    it('should apply containerClassName to container', () => {
      const { container } = render(
        <LazyImage 
          src="/test-image.jpg" 
          alt="Test image" 
          containerClassName="container-class"
        />
      );
      
      const containerDiv = container.firstChild as HTMLElement;
      expect(containerDiv).toHaveClass('container-class');
    });
    
    it('should apply containerStyle to container', () => {
      const { container } = render(
        <LazyImage 
          src="/test-image.jpg" 
          alt="Test image" 
          containerStyle={{ margin: '10px' }}
        />
      );
      
      const containerDiv = container.firstChild as HTMLElement;
      expect(containerDiv).toHaveStyle({ margin: '10px' });
    });
  });
  
  describe('lazy loading disabled', () => {
    it('should render image immediately when lazy is false', () => {
      render(
        <LazyImage 
          src="/test-image.jpg" 
          alt="Test image" 
          lazy={false}
        />
      );
      
      const img = screen.getByRole('img', { name: 'Test image' });
      expect(img).toBeInTheDocument();
    });
  });
  
  describe('additional img attributes', () => {
    it('should pass through additional img attributes', () => {
      render(
        <LazyImage 
          src="/test-image.jpg" 
          alt="Test image" 
          data-testid="test-img"
          title="Test title"
        />
      );
      
      const img = screen.getByRole('img', { name: 'Test image' });
      expect(img).toHaveAttribute('data-testid', 'test-img');
      expect(img).toHaveAttribute('title', 'Test title');
    });
  });
});

describe('injectLazyImageStyles', () => {
  beforeEach(() => {
    // Clean up any existing style elements
    const existingStyle = document.getElementById('lazy-image-styles');
    if (existingStyle) {
      existingStyle.remove();
    }
  });
  
  it('should inject styles into document head', () => {
    injectLazyImageStyles();
    
    const styleElement = document.getElementById('lazy-image-styles');
    expect(styleElement).toBeInTheDocument();
    expect(styleElement?.textContent).toContain('@keyframes shimmer');
  });
  
  it('should not inject duplicate styles', () => {
    injectLazyImageStyles();
    injectLazyImageStyles();
    
    const styleElements = document.querySelectorAll('#lazy-image-styles');
    expect(styleElements.length).toBe(1);
  });
});
