/**
 * usePDFStreamingChat - Hook for PDF chat with RAG context integration
 *
 * This hook integrates the PDF RAG retrieval with the AI streaming chat.
 * It retrieves relevant context from PDFs and passes it to the AI model
 * along with the user's question.
 *
 * Requirements: 6.1, 7.7, 8.1, 8.2
 */

import { useState, useCallback, useRef } from 'react';
import { useSettings } from '../../../contexts/SettingsContext';
import { useToast } from '../../shared/Toast';
import { streamOllamaCompletion } from '../../../services/ollama';
import { streamPerplexityCompletion } from '../../../services/perplexity';
import { streamGeminiCompletion } from '../../../services/gemini';
import { streamGroqCompletion } from '../../../services/groq';
import { streamOpenRouterCompletion } from '../../../services/openrouter';
import { streamMiniMaxCompletion } from '../../../services/minimax';
import { getPDFSystemPrompt } from '../../../prompts/pdfSystemPrompt';
import type { PDFChatMessage } from '../../../types/pdf';

const UPDATE_INTERVAL = 120; // ms

interface UsePDFStreamingChatOptions {
  documentIds: string[];
  messages: PDFChatMessage[];
  onMessageUpdate?: (message: PDFChatMessage) => void;
}

export function usePDFStreamingChat({ documentIds, messages, onMessageUpdate }: UsePDFStreamingChatOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { settings } = useSettings();
  const { showToast } = useToast();

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  /**
   * Send a message with PDF RAG context to the AI model
   */
  const sendMessage = useCallback(async (userMessage: string, ragContext: string) => {
    if (!userMessage.trim() || isLoading || documentIds.length === 0) return;

    stopStreaming();
    setIsLoading(true);

    const startTime = performance.now();
    let accumulatedContent = '';
    let lastUpdateTime = Date.now();
    let firstTokenTime: number | null = null;

    // Prepare conversation history
    const conversationHistory = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    // Build system prompt with PDF context
    const systemPrompt = getPDFSystemPrompt(ragContext);

    // Build messages array with system prompt
    const messagesForModel: any[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];

    const throttledUpdate = async () => {
      const now = Date.now();
      if (now - lastUpdateTime >= UPDATE_INTERVAL) {
        onMessageUpdate?.({ content: accumulatedContent } as PDFChatMessage);
        lastUpdateTime = now;
        // Small delay to prevent UI blocking
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    };

    const streamOllama = async (messagesForStream: any[]) => {
      for await (const chunk of streamOllamaCompletion(
        settings.ollamaUrl,
        settings.aiModel,
        messagesForStream,
        { temperature: settings.temperature }
      )) {
        const delta = chunk.message?.content || '';
        if (!firstTokenTime && delta) firstTokenTime = performance.now();
        accumulatedContent += delta;
        await throttledUpdate();
      }
    };

    const streamPerplexity = async (messagesForStream: any[]) => {
      for await (const chunk of streamPerplexityCompletion(
        settings.perplexityApiKey,
        settings.aiModel,
        messagesForStream,
        { temperature: settings.temperature, max_tokens: settings.maxTokens }
      )) {
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (!firstTokenTime && delta) firstTokenTime = performance.now();
        accumulatedContent += delta;
        await throttledUpdate();
      }
    };

    const streamGemini = async (messagesForStream: any[]) => {
      // Remove system message for Gemini (doesn't support it directly)
      const geminiMessages = messagesForStream.filter((m: any) => m.role !== 'system');
      for await (const chunk of streamGeminiCompletion(
        settings.geminiApiKey,
        settings.aiModel,
        geminiMessages,
        { temperature: settings.temperature, maxOutputTokens: settings.maxTokens }
      )) {
        const delta = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!firstTokenTime && delta) firstTokenTime = performance.now();
        accumulatedContent += delta;
        await throttledUpdate();
      }
    };

    const streamGroq = async (messagesForStream: any[]) => {
      for await (const chunk of streamGroqCompletion(
        settings.groqApiKey,
        settings.aiModel,
        messagesForStream,
        { temperature: settings.temperature, max_tokens: settings.maxTokens }
      )) {
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (!firstTokenTime && delta) firstTokenTime = performance.now();
        accumulatedContent += delta;
        await throttledUpdate();
      }
    };

    const streamMiniMax = async (messagesForStream: any[]) => {
      for await (const chunk of streamMiniMaxCompletion(
        settings.minimaxApiKey,
        settings.aiModel,
        messagesForStream,
        { temperature: settings.temperature, maxTokens: settings.maxTokens }
      )) {
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (!firstTokenTime && delta) firstTokenTime = performance.now();
        accumulatedContent += delta;
        await throttledUpdate();
      }
    };

    const streamOpenRouter = async (messagesForStream: any[]) => {
      for await (const chunk of streamOpenRouterCompletion(
        settings.openRouterApiKey,
        settings.aiModel,
        messagesForStream,
        { temperature: settings.temperature, maxTokens: settings.maxTokens }
      )) {
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (!firstTokenTime && delta) firstTokenTime = performance.now();
        accumulatedContent += delta;
        await throttledUpdate();
      }
    };

    try {
      // Route to appropriate provider
      if (settings.modelProvider === 'ollama') {
        await streamOllama(messagesForModel);
      } else if (settings.modelProvider === 'perplexity') {
        await streamPerplexity(messagesForModel);
      } else if (settings.modelProvider === 'gemini') {
        await streamGemini(messagesForModel);
      } else if (settings.modelProvider === 'groq') {
        await streamGroq(messagesForModel);
      } else if (settings.modelProvider === 'minimax') {
        await streamMiniMax(messagesForModel);
      } else {
        // OpenRouter (default)
        await streamOpenRouter(messagesForModel);
      }

      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      const ttft = firstTokenTime ? Math.round(firstTokenTime - startTime) : undefined;

      return {
        content: accumulatedContent,
        model: `${settings.modelProvider}/${settings.aiModel}`,
        latency,
        ttft
      };

    } catch (error: any) {
      console.error('[usePDFStreamingChat] Error:', error);

      let errorMsg = 'An error occurred while generating the response.';

      if (error.message?.includes('429') || error.message?.includes('rate limit')) {
        errorMsg = 'Rate limit exceeded. Please try again in a moment.';
        showToast(errorMsg, 'warning');
      } else if (error.message?.includes('401') || error.message?.includes('403')) {
        errorMsg = 'Invalid API key. Please check your API key in Settings.';
        showToast(errorMsg, 'error');
      } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
        errorMsg = 'Network error. Please check your internet connection.';
        showToast(errorMsg, 'error');
      } else if (error.name === 'AbortError') {
        errorMsg = 'Request was cancelled.';
      }

      return {
        content: errorMsg,
        model: `${settings.modelProvider}/${settings.aiModel}`,
        error: true
      };
    } finally {
      setIsLoading(false);
    }
  }, [documentIds, messages, settings, isLoading, stopStreaming, showToast]);

  return {
    isLoading,
    sendMessage,
    stopStreaming
  };
}
