# Pasted Content Chunks Feature - Implementation Plan

## Overview
When pasting long text into the input area, display it as a compact "Pasted xxx chars" container in the chat area instead of filling the input field. Users can chat alongside these chunks and edit them via an overlay modal.

## Files to Create

### 1. `src/components/Dashboard/ChatArea/PastedContentChunk.tsx`
A component that displays a compact container showing "Pasted xxx chars" with:
- Visual styling matching the existing design (using CSS variables)
- Hover state showing Edit and Delete buttons
- Click-to-edit functionality
- Animation on appearance

**Key features:**
- Props: `id`, `content`, `charCount`, `onEdit`, `onDelete`
- Inline styles matching the app's design system
- Edit2 and X icons from lucide-react (already exported)
- Hover reveal of action buttons

### 2. `src/components/Dashboard/ChatArea/PastedContentEditModal.tsx`
A modal overlay for editing pasted content with:
- Full-screen overlay with backdrop blur
- Centered modal with textarea for editing
- Character count display
- Save and Cancel buttons
- Delete button

**Key features:**
- Props: `content`, `onSave`, `onCancel`, `onDelete`
- Similar styling to existing ImageModal
- Auto-resizing textarea
- Character count (e.g., "1,234 chars")

### 3. `src/components/Dashboard/ChatArea/types.ts`
Type definitions for pasted content chunks:

```typescript
export interface PastedContentChunk {
  id: string
  content: string
  charCount: number
  createdAt: number
}
```

## Files to Modify

### 4. `src/components/Dashboard/ChatArea/InputArea.tsx`
**Changes:**
- Add `onChunkCreate` prop callback
- Modify `handlePaste` to detect long text pastes (>100 chars)
- When long text is pasted, prevent default and call `onChunkCreate`
- Keep existing file paste behavior

**Logic:**
```typescript
const PASTE_THRESHOLD = 100 // chars

const handlePaste = async (event: React.ClipboardEvent) => {
  const items = event.clipboardData.items
  const files: File[] = []

  // Check for files first (existing behavior)
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }

  if (files.length > 0) {
    // Existing file handling...
    return
  }

  // Check for long text paste
  const pastedText = event.clipboardData.getData('text')
  if (pastedText.length > PASTE_THRESHOLD) {
    event.preventDefault()
    onChunkCreate(pastedText)
  }
  // Otherwise, allow default paste behavior for short text
}
```

### 5. `src/components/Dashboard/ChatArea.tsx`
**Changes:**
- Add `pastedChunks` state array
- Add `handleChunkCreate` function
- Add `handleChunkUpdate` function
- Add `handleChunkDelete` function
- Render chunks above the InputArea
- Include chunk content when sending messages

**New state:**
```typescript
const [pastedChunks, setPastedChunks] = useState<PastedContentChunk[]>([])
const [editingChunk, setEditingChunk] = useState<PastedContentChunk | null>(null)
```

**Render chunks before InputArea:**
```tsx
{/* Pasted Content Chunks */}
{pastedChunks.length > 0 && (
  <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
    {pastedChunks.map(chunk => (
      <PastedContentChunk
        key={chunk.id}
        {...chunk}
        onEdit={() => setEditingChunk(chunk)}
        onDelete={() => handleChunkDelete(chunk.id)}
      />
    ))}
  </div>
)}

<InputArea ... onChunkCreate={handleChunkCreate} />
```

**Modify message sending to include chunks:**
```typescript
const handleSendMessage = async () => {
  const chunkContent = pastedChunks.map(c => c.content).join('\n\n---\n\n')
  const fullInput = input.trim() + (chunkContent ? `\n\n[Attached Content]\n${chunkContent}` : '')
  // ... send with fullInput
}
```

### 6. `src/components/icons/index.ts`
**Already has required icons:**
- `Edit2` - for edit button
- `X` - for delete button
- No changes needed

## Visual Design Specifications

### PastedContentChunk Container
- Background: `var(--theme-surface)` with `rgba(255,255,255,0.03)` overlay
- Border: `1px solid rgba(255,255,255,0.1)`
- Border radius: `10px`
- Padding: `10px 14px`
- Max width: fits with input area
- Display: flex row, space between
- Hover action buttons: fade in with `opacity: 0` -> `opacity: 1`

### Edit Modal
- Backdrop: `rgba(0,0,0,0.8)` with blur
- Modal: `var(--theme-surface)` with `border: 1px solid var(--theme-border)`
- Width: `90%`, max-width: `700px`
- Height: `80%`
- Border radius: `12px`
- Textarea: full width, auto-resize, `var(--theme-text-primary)` color

## Implementation Order

1. **Create types** - Add `PastedContentChunk` interface
2. **Create PastedContentChunk component** - Basic display with hover actions
3. **Create PastedContentEditModal component** - Edit overlay
4. **Modify InputArea** - Add paste detection for long text
5. **Modify ChatArea** - Add state management and rendering
6. **Test the flow** - Paste long text, edit, send message with chunks

## Edge Cases to Handle

- **Short pastes** (< 100 chars) - default behavior, insert into textarea
- **File + text paste** - prioritize file handling
- **Multiple chunks** - support multiple pasted chunks
- **Empty chunks** - don't allow saving empty content
- **Message sending** - clear chunks after sending (or keep? clarify with user)
