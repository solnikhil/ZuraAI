/**
 * AppearanceSection component for Settings
 * Wraps ThemesPage for theme customization
 * 
 * @module AppearanceSection
 * Requirements: 2.4
 */

import React, { useLayoutEffect } from 'react'
import ThemesPage from '../../ThemesPage'
import { useSettings } from '../../../contexts/SettingsContext'
import { getThemeById, getDefaultTheme } from '../../../themes/themeRegistry'
import { applyThemeToDocument } from '../../../themes/themeUtils'

/**
 * Props for AppearanceSection component
 */
export interface AppearanceSectionProps {
  // Currently no props needed as ThemesPage manages its own state
}

/**
 * AppearanceSection - Theme customization wrapper
 * Ensures theme is properly applied when viewing themes settings
 * Delegates to ThemesPage component for theme selection
 */
export function AppearanceSection(_props: AppearanceSectionProps): React.ReactElement {
  const { settings } = useSettings()

  // Ensure theme is applied when this section mounts
  useLayoutEffect(() => {
    const theme = getThemeById(settings.activeTheme) || getDefaultTheme()
    applyThemeToDocument(theme)
  }, [settings.activeTheme])

  return <ThemesPage />
}

export default AppearanceSection
