# Providers Hub Plan

## Goal
Build one all-in-one **Providers** settings experience that combines:
- model providers
- API key management
- search API management
- custom model creation

This replaces separate **Models** and **API Keys** pages with one unified flow.

---

## UX Requirements

1. Single sidebar entry: `Providers`
2. Top of page has:
   - search input
   - `Manage by` selector (Model Providers / Search APIs)
   - `Add New` button
3. Provider cards grid (logo, name, description, toggle)
4. Clicking a provider opens provider detail panel/page
5. Detail form includes **API Key only** (no proxy URL field)
6. `Add New` opens custom model modal

---

## Implementation Scope

### A) Navigation + Section Unification
- Add/rename settings section to `providers`
- Replace old `models` + `preferences` sidebar entries with one `providers` entry
- Keep backward compatibility:
  - normalize persisted `models`/`preferences` to `providers`

### B) New Providers Hub UI
- Build unified section component with:
  - header
  - search
  - manage mode toggle
  - provider cards
  - provider detail panel
- Provider cards should support enabled/disabled toggle states

### C) Provider Detail View
- Show provider metadata and status
- API key input with show/hide toggle
- No proxy URL input

### D) Add New Modal (Custom Model)
- Form fields:
  - model ID (required)
  - display name
  - max context
  - capability toggles
  - model type
- Save into configured model list

### E) Persistence + Settings Wiring
- Reuse existing settings update flow
- Reuse secure storage API key save path on Save Changes
- Extend configured model shape with optional metadata fields (non-breaking)

### F) Command Bar + Title Labels
- Update settings section labels and command suggestions to `providers`

---

## Files Planned

- `src/components/Settings/Settings.tsx`
- `src/components/Settings/sections/ProviderHubSection.tsx` (new)
- `src/components/Settings/sections/CreateCustomModelDialog.tsx` (new)
- `src/components/Settings/sections/index.ts`
- `src/components/Settings/index.ts`
- `src/components/Dashboard/Sidebar.tsx`
- `src/contexts/AppShellContext.tsx`
- `src/components/TitleBar.tsx`
- `src/commandBar/suggestions.ts`
- `src/components/TitleBarCommandBar.tsx`
- `src/contexts/SettingsConfigContext.tsx`

---

## Acceptance Criteria

- Only one settings nav item for this area: `Providers`
- Top controls show Search + Manage By + Add New
- Provider cards render and can be toggled
- Clicking card opens provider detail
- Detail has API key input and no proxy URL
- Add New opens modal and saves custom model
- Existing stored section values (`models`, `preferences`) open Providers correctly

---

## Test Plan

1. Unit tests:
   - section normalization (`models`/`preferences` -> `providers`)
   - command suggestion routes for providers
2. Interaction tests:
   - card click opens detail
   - add new opens modal
   - modal submit updates settings model list
3. Run tests:
   - `npm test`
