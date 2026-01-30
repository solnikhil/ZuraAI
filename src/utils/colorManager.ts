/**
 * Color Manager - Persistent color assignment for AI models
 * Stores model-to-color mappings in localStorage to ensure consistency
 */

const STORAGE_KEY = 'zura-model-colors'

// Vibrant color palette - high contrast, easily distinguishable
const VIBRANT_COLORS = [
  'hsl(217, 91%, 60%)',  // Blue
  'hsl(142, 71%, 45%)',  // Green
  'hsl(25, 95%, 53%)',   // Orange
  'hsl(271, 81%, 56%)',  // Purple
  'hsl(330, 81%, 60%)',  // Pink
  'hsl(189, 85%, 46%)',  // Cyan
  'hsl(0, 84%, 60%)',    // Red
  'hsl(48, 96%, 53%)',   // Yellow
  'hsl(291, 64%, 42%)',  // Deep Purple
  'hsl(122, 39%, 49%)',  // Forest Green
  'hsl(14, 100%, 57%)',  // Coral
  'hsl(204, 70%, 53%)',  // Sky Blue
  'hsl(340, 82%, 52%)',  // Rose
  'hsl(162, 63%, 41%)',  // Teal
  'hsl(45, 93%, 47%)',   // Gold
  'hsl(262, 52%, 47%)',  // Indigo
]

interface ColorMapping {
  [modelName: string]: string
}

/**
 * Load color mappings from localStorage
 */
function loadMappings(): ColorMapping {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

/**
 * Save color mappings to localStorage
 */
function saveMappings(mappings: ColorMapping): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings))
  } catch (e) {
    console.warn('Failed to save model color mappings:', e)
  }
}

/**
 * Get the next available color from the palette
 */
function getNextColor(usedColors: Set<string>): string {
  for (const color of VIBRANT_COLORS) {
    if (!usedColors.has(color)) {
      return color
    }
  }
  // If all colors are used, cycle back (shouldn't happen with 16 colors)
  return VIBRANT_COLORS[usedColors.size % VIBRANT_COLORS.length]
}

/**
 * Assign a color to a model name
 * Returns existing color if already assigned, otherwise assigns a new one
 */
export function assignColor(modelName: string): string {
  const mappings = loadMappings()
  
  // Return existing color if already assigned
  if (mappings[modelName]) {
    return mappings[modelName]
  }
  
  // Find used colors
  const usedColors = new Set(Object.values(mappings))
  
  // Assign next available color
  const newColor = getNextColor(usedColors)
  mappings[modelName] = newColor
  saveMappings(mappings)
  
  return newColor
}

/**
 * Get all current color mappings
 */
export function getAllMappings(): ColorMapping {
  return loadMappings()
}

/**
 * Clear all color mappings (for testing/reset)
 */
export function clearMappings(): void {
  localStorage.removeItem(STORAGE_KEY)
}
