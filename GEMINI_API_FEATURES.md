# Gemini API Features Implementation

This document describes all the Gemini API features that have been implemented in Zura AI.

## Overview

The Gemini API service (`src/services/gemini.ts`) now supports all major features from the official Gemini API documentation, including:

- ✅ Advanced generation configuration
- ✅ Safety settings
- ✅ System instructions
- ✅ Structured outputs (JSON Schema)
- ✅ Google Search grounding
- ✅ Function calling (tools)
- ✅ Streaming support

## Features

### 1. Generation Configuration

Control how the model generates responses:

```typescript
import { generateGeminiCompletion } from './services/gemini'

const response = await generateGeminiCompletion(apiKey, model, messages, {
    temperature: 0.7,           // Creativity (0.0-2.0)
    topP: 0.95,                 // Nucleus sampling threshold
    topK: 40,                   // Top-K sampling
    maxOutputTokens: 2048,      // Maximum tokens to generate
    candidateCount: 1,          // Number of response candidates
    stopSequences: ['STOP'],     // Sequences that stop generation
})
```

### 2. Safety Settings

Control content filtering:

```typescript
import { generateGeminiCompletion, type GeminiSafetySetting } from './services/gemini'

const safetySettings: GeminiSafetySetting[] = [
    {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
    },
    {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_LOW_AND_ABOVE'
    }
]

const response = await generateGeminiCompletion(apiKey, model, messages, {
    safetySettings
})
```

**Available Safety Categories:**
- `HARM_CATEGORY_HARASSMENT`
- `HARM_CATEGORY_HATE_SPEECH`
- `HARM_CATEGORY_SEXUALLY_EXPLICIT`
- `HARM_CATEGORY_DANGEROUS_CONTENT`

**Available Thresholds:**
- `BLOCK_NONE` - Don't block any content
- `BLOCK_ONLY_HIGH` - Block only high-probability harmful content
- `BLOCK_MEDIUM_AND_ABOVE` - Block medium and high probability
- `BLOCK_LOW_AND_ABOVE` - Block all potentially harmful content

### 3. System Instructions

Guide the model's behavior with system instructions:

```typescript
const response = await generateGeminiCompletion(apiKey, model, messages, {
    systemInstruction: 'You are a helpful coding assistant. Always provide code examples.'
})
```

Or use structured parts:

```typescript
const response = await generateGeminiCompletion(apiKey, model, messages, {
    systemInstruction: {
        parts: [{ text: 'You are a helpful assistant.' }]
    }
})
```

### 4. Structured Outputs (JSON Schema)

Get structured JSON responses:

```typescript
const response = await generateGeminiCompletion(apiKey, model, messages, {
    responseMimeType: 'application/json',
    responseSchema: {
        type: 'object',
        properties: {
            name: { type: 'string' },
            age: { type: 'number' },
            email: { type: 'string' }
        },
        required: ['name', 'age']
    }
})
```

### 5. Google Search Grounding

Enable real-time information retrieval:

```typescript
import { generateGeminiCompletion, type GeminiGroundingConfig } from './services/gemini'

const groundingConfig: GeminiGroundingConfig = {
    googleSearchRetrieval: {
        dynamicRetrievalConfig: {
            mode: 'MODE_DYNAMIC',
            dynamicThreshold: 0.3
        }
    }
}

const response = await generateGeminiCompletion(apiKey, model, messages, {
    groundingConfig
})

// Access grounding metadata in response
if (response.groundingMetadata?.groundingChunks) {
    response.groundingMetadata.groundingChunks.forEach(chunk => {
        console.log('Source:', chunk.web?.uri)
        console.log('Title:', chunk.web?.title)
    })
}
```

### 6. Function Calling (Tools)

Already implemented! Tools are automatically converted to Gemini function declarations:

```typescript
const response = await generateGeminiCompletion(apiKey, model, messages, {
    tools: geminiTools  // Automatically formatted from tool definitions
})
```

### 7. Streaming

Stream responses in real-time:

```typescript
import { streamGeminiCompletion } from './services/gemini'

for await (const chunk of streamGeminiCompletion(apiKey, model, messages, {
    temperature: 0.7,
    maxOutputTokens: 2048,
    onChunk: (chunk) => {
        console.log('Received chunk:', chunk)
    }
})) {
    const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || ''
    if (text) {
        // Process streaming text
    }
}
```

## Complete Example

```typescript
import { 
    generateGeminiCompletion, 
    type GeminiRequestOptions,
    type GeminiSafetySetting,
    type GeminiGroundingConfig
} from './services/gemini'

const safetySettings: GeminiSafetySetting[] = [
    {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
    }
]

const groundingConfig: GeminiGroundingConfig = {
    googleSearchRetrieval: {
        dynamicRetrievalConfig: {
            mode: 'MODE_DYNAMIC'
        }
    }
}

const options: GeminiRequestOptions = {
    // Generation config
    temperature: 0.8,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 2048,
    
    // System instruction
    systemInstruction: 'You are a helpful AI assistant.',
    
    // Safety settings
    safetySettings,
    
    // Grounding (Google Search)
    groundingConfig,
    
    // Structured output
    responseMimeType: 'application/json',
    responseSchema: {
        type: 'object',
        properties: {
            answer: { type: 'string' },
            sources: { 
                type: 'array',
                items: { type: 'string' }
            }
        },
        required: ['answer']
    },
    
    // Tools (function calling)
    tools: geminiTools
}

const response = await generateGeminiCompletion(apiKey, 'gemini-2.0-flash', messages, options)

// Access response
const text = response.candidates[0].content.parts[0].text
const safetyRatings = response.candidates[0].safetyRatings
const groundingChunks = response.groundingMetadata?.groundingChunks
```

## Type Definitions

All types are exported from `src/services/gemini.ts`:

- `GeminiRequestOptions` - Complete options interface
- `GeminiGenerationConfig` - Generation configuration
- `GeminiSafetySetting` - Safety settings
- `GeminiSafetyCategory` - Safety category types
- `GeminiSafetyThreshold` - Safety threshold types
- `GeminiGroundingConfig` - Grounding configuration
- `GeminiResponse` - Response interface
- `GeminiStreamChunk` - Streaming chunk interface

## Backward Compatibility

All existing code continues to work! The new `GeminiRequestOptions` interface is backward compatible with the old simple options object:

```typescript
// Old way (still works)
await generateGeminiCompletion(apiKey, model, messages, {
    temperature: 0.7,
    maxOutputTokens: 1000,
    tools: geminiTools
})

// New way (with all features)
await generateGeminiCompletion(apiKey, model, messages, {
    temperature: 0.7,
    maxOutputTokens: 1000,
    tools: geminiTools,
    systemInstruction: '...',
    safetySettings: [...],
    groundingConfig: {...}
})
```

## References

- [Official Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
- [Gemini API Models](https://ai.google.dev/gemini-api/docs/models)
- [Gemini API Reference](https://ai.google.dev/api)


