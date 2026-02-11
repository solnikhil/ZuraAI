# Model Capability Badges (OpenRouter API)

## Goal

Implement capability badges for models based on API-derived properties. Show badges for: Tool Integration, Vision, Deep Thinking, Web Search, Image Generation, and Video Recognition. Use the OpenRouter API to fetch and map capabilities, and display badges in both the dashboard model selector and settings Provider Hub.

---

## Current State

| Component | Status |
|-----------|--------|
| **ConfiguredModel** | Has capability fields: `supportsToolCall`, `supportsVision`, `supportsDeepThinking`, `supportsWebSearch`, `supportsImageGeneration`, `supportsVideoRecognition` |
| **CreateCustomModelDialog** | Manual toggles for each capability; no API fetch |
| **ModelList** | Uses heuristic `detectModelCapabilities(modelName)`; shows only Vision + Code badges |
| **OpenRouter Models API** | `GET https://openrouter.ai/api/v1/models` returns full model catalog with architecture and supported params |

---

## API-to-Capability Mapping (OpenRouter)

| Property | OpenRouter API Source |
|----------|------------------------|
| Tool Integration | `supported_parameters` includes `"tools"` |
| Vision | `architecture.input_modalities` includes `"image"` |
| Deep Thinking | `supported_parameters` includes `"reasoning"` or `"include_reasoning"` |
| Web Search | `pricing.web_search` exists (non-zero) |
| Image Generation | `architecture.output_modalities` includes `"image"` |
| Video Recognition | `architecture.input_modalities` includes `"video"` |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ OpenRouter API                                                    │
│ GET /api/v1/models                                                │
└─────────────────────────────┬────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ openrouterModels.ts (new service)                                 │
│ - fetchOpenRouterModels(apiKey?)                                  │
│ - mapOpenRouterModelToConfiguredModel(apiModel)                   │
└─────────────────────────────┬────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐
│ OpenRouterModel │  │ ModelList       │  │ ProviderHubSection       │
│ SearchDialog    │  │ (Dashboard)     │  │ (Settings)               │
│                 │  │                 │  │                          │
│ - Search models │  │ - Badge icons   │  │ - Add from Catalog btn   │
│ - Add w/caps    │  │ - Tooltip chips │  │ - Badges on model rows   │
└─────────────────┘  └─────────────────┘  └─────────────────────────┘
```

---

## Implementation Plan

### 1. OpenRouter Models Service

**File:** `src/services/openrouterModels.ts` (new)

- `fetchOpenRouterModels(apiKey?: string)`: Fetch `GET https://openrouter.ai/api/v1/models`
- `mapOpenRouterModelToConfiguredModel(apiModel)`: Map API response to `ConfiguredModel` with capabilities:
  - `supportsToolCall` ← `supported_parameters?.includes('tools')`
  - `supportsVision` ← `architecture?.input_modalities?.includes('image')`
  - `supportsDeepThinking` ← `supported_parameters` includes `'reasoning'` or `'include_reasoning'`
  - `supportsWebSearch` ← `pricing?.web_search != null` (and typically non-zero)
  - `supportsImageGeneration` ← `architecture?.output_modalities?.includes('image')`
  - `supportsVideoRecognition` ← `architecture?.input_modalities?.includes('video')`
- `searchOpenRouterModels(models, query)`: Filter models by name/id/description

### 2. Extend ModelWithProvider

**File:** `src/components/Dashboard/ModelSelector/types.ts`

- Add optional capability fields to `ModelWithProvider` so capability data flows from `ConfiguredModel` to list/dropdown

### 3. Badge Utilities

**File:** `src/utils/modelUtils.ts`

- Add `CAPABILITY_BADGES`: map each capability to label + icon
  - Tool Calling → Wrench
  - Vision → Eye
  - Deep Thinking → Brain
  - Web Search → Globe
  - Image Gen → Image
  - Video → Video
- Add `getCapabilitiesFromModel(model)`: Prefer explicit `ConfiguredModel` fields; fall back to `detectModelCapabilities` when no API data

### 4. ModelList and ModelSelector Badges

**File:** `src/components/Dashboard/ModelSelector/ModelList.tsx`

- Replace `detectModelCapabilities` usage with `getCapabilitiesFromModel`
- Render all 6 capability badges (icon + tooltip)
- Update tooltip chips to show API-derived capabilities

**File:** `src/components/Dashboard/ModelSelector.tsx`

- Ensure `renderModelItem` passes capability badges when applicable (if model rows show badges)

### 5. Settings: OpenRouter Model Search / Add from API

**File:** `src/components/Settings/sections/OpenRouterModelSearchDialog.tsx` (new)

- Dialog with search input
- Fetch models via `fetchOpenRouterModels` when opened
- Display searchable list with capability badges
- On "Add", call `mapOpenRouterModelToConfiguredModel` and append to `configuredModels`

**File:** `src/components/Settings/sections/ProviderHubSection.tsx`

- Add "Add from OpenRouter catalog" / "Add from Catalog" button (only when OpenRouter selected)
- Render `OpenRouterModelSearchDialog` when that button is clicked
- Show capability badges on each model row in the ModelGroup component

### 6. Optional: Capability Sync

- Add "Refresh capabilities from API" for existing OpenRouter models: re-fetch, match by `id`/`code`, merge capability flags into `configuredModels`

---

## Files Summary

| File | Action |
|------|--------|
| `src/services/openrouterModels.ts` | Create |
| `src/utils/modelUtils.ts` | Modify (add badge config, getCapabilitiesFromModel) |
| `src/components/Dashboard/ModelSelector/types.ts` | Modify (add capability fields) |
| `src/components/Dashboard/ModelSelector/ModelList.tsx` | Modify (use API caps, render 6 badges) |
| `src/components/Dashboard/ModelSelector.tsx` | Modify if needed for inline badges |
| `src/components/Settings/sections/OpenRouterModelSearchDialog.tsx` | Create |
| `src/components/Settings/sections/ProviderHubSection.tsx` | Modify (catalog button, badges on rows) |

---

## Badge Design

- Small pill/chip badges per capability
- Icons: Wrench, Eye, Brain, Globe, Image, Video (from lucide-react)
- Labels: "Tool Calling", "Vision", "Deep Thinking", "Web Search", "Image Gen", "Video"

---

## Security

- Fetch runs in renderer; no new IPC
- API key passed from settings context (secure storage)
- No main-process changes per AGENTS.md

---

## Acceptance Criteria

- [ ] OpenRouter models can be added from API catalog with auto-mapped capabilities
- [ ] Dashboard model selector shows capability badges for all 6 types when data exists
- [ ] Settings Provider Hub shows capability badges on OpenRouter model rows
- [ ] "Add from Catalog" button appears when OpenRouter is selected
- [ ] Models without API data fall back to heuristic detection (backward compatible)
