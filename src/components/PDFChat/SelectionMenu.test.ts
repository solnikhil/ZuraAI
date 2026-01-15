/**
 * SelectionMenu Tests
 * 
 * Tests for the selection menu prompt generation functions.
 * Requirements: 4.3, 4.4, 4.5, 4.6
 */

import { describe, it, expect } from 'vitest';
import {
  generateExplainPrompt,
  generateSummarizePrompt,
  generateAskPrompt,
  generateFindContradictionsPrompt,
  generatePromptForAction,
} from './useSelectionMenu';
import type { TextSelection } from '../../types/pdf';

// Test fixture
const createTestSelection = (text: string, pageNumber: number = 1): TextSelection => ({
  text,
  documentId: 'test-doc-123',
  pageNumber,
  boundingBox: {
    x0: 100,
    y0: 200,
    x1: 300,
    y1: 220,
    pageNumber,
  },
});

describe('SelectionMenu Prompt Generation', () => {
  describe('generateExplainPrompt', () => {
    it('should include the selected text in the prompt', () => {
      const selection = createTestSelection('quantum entanglement');
      const prompt = generateExplainPrompt(selection);
      
      expect(prompt).toContain('quantum entanglement');
    });

    it('should include the page number', () => {
      const selection = createTestSelection('test text', 5);
      const prompt = generateExplainPrompt(selection);
      
      expect(prompt).toContain('page 5');
    });

    it('should request explanation of complex concepts', () => {
      const selection = createTestSelection('test');
      const prompt = generateExplainPrompt(selection);
      
      expect(prompt.toLowerCase()).toContain('explain');
    });
  });

  describe('generateSummarizePrompt', () => {
    it('should include the selected text in the prompt', () => {
      const selection = createTestSelection('A long passage about various topics');
      const prompt = generateSummarizePrompt(selection);
      
      expect(prompt).toContain('A long passage about various topics');
    });

    it('should include the page number', () => {
      const selection = createTestSelection('test text', 10);
      const prompt = generateSummarizePrompt(selection);
      
      expect(prompt).toContain('page 10');
    });

    it('should request a summary', () => {
      const selection = createTestSelection('test');
      const prompt = generateSummarizePrompt(selection);
      
      expect(prompt.toLowerCase()).toContain('summary');
    });
  });

  describe('generateAskPrompt', () => {
    it('should include the selected text in the prompt', () => {
      const selection = createTestSelection('specific terminology');
      const prompt = generateAskPrompt(selection);
      
      expect(prompt).toContain('specific terminology');
    });

    it('should include the page number', () => {
      const selection = createTestSelection('test text', 3);
      const prompt = generateAskPrompt(selection);
      
      expect(prompt).toContain('page 3');
    });

    it('should indicate this is for asking questions', () => {
      const selection = createTestSelection('test');
      const prompt = generateAskPrompt(selection);
      
      expect(prompt.toLowerCase()).toContain('ask');
    });
  });

  describe('generateFindContradictionsPrompt', () => {
    it('should include the selected text in the prompt', () => {
      const selection = createTestSelection('The results show a 50% increase');
      const prompt = generateFindContradictionsPrompt(selection);
      
      expect(prompt).toContain('The results show a 50% increase');
    });

    it('should include the page number', () => {
      const selection = createTestSelection('test text', 7);
      const prompt = generateFindContradictionsPrompt(selection);
      
      expect(prompt).toContain('page 7');
    });

    it('should request searching for contradictions', () => {
      const selection = createTestSelection('test');
      const prompt = generateFindContradictionsPrompt(selection);
      
      expect(prompt.toLowerCase()).toContain('contradict');
    });
  });

  describe('generatePromptForAction', () => {
    const selection = createTestSelection('test selection', 2);

    it('should generate explain prompt for explain action', () => {
      const prompt = generatePromptForAction('explain', selection);
      expect(prompt).toBe(generateExplainPrompt(selection));
    });

    it('should generate summarize prompt for summarize action', () => {
      const prompt = generatePromptForAction('summarize', selection);
      expect(prompt).toBe(generateSummarizePrompt(selection));
    });

    it('should generate ask prompt for ask action', () => {
      const prompt = generatePromptForAction('ask', selection);
      expect(prompt).toBe(generateAskPrompt(selection));
    });

    it('should generate find contradictions prompt for findContradictions action', () => {
      const prompt = generatePromptForAction('findContradictions', selection);
      expect(prompt).toBe(generateFindContradictionsPrompt(selection));
    });

    it('should handle unknown actions gracefully', () => {
      // @ts-expect-error - Testing unknown action
      const prompt = generatePromptForAction('unknown', selection);
      expect(prompt).toContain('test selection');
      expect(prompt).toContain('page 2');
    });
  });
});
