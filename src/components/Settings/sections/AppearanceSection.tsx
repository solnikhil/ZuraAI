/**
 * AppearanceSection component for Settings
 * Wraps ThemesPage for theme customization
 * 
 * @module AppearanceSection
 * Requirements: 2.4
 */

import React from 'react'
import ThemesPage from '../../ThemesPage'

/**
 * Props for AppearanceSection component
 */
export interface AppearanceSectionProps {
  // Currently no props needed as ThemesPage manages its own state
}

/**
 * AppearanceSection - Theme customization wrapper
 * Delegates to ThemesPage component for theme selection
 */
export function AppearanceSection(_props: AppearanceSectionProps): React.ReactElement {
  return <ThemesPage />
}

export default AppearanceSection
