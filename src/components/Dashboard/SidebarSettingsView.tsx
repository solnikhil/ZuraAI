import React from 'react'
import { SETTINGS_SECTIONS, type SettingsSectionId } from '../../constants/settingsSections'
import { Box, ChartNoAxesCombined, Cloud, Paintbrush, FileText, Puzzle } from '../icons'

interface SidebarSettingsViewProps {
  active: boolean
  activeSettingsSection: string
  onNavigateSettings: (section: string) => void
}

const settingsIcons: Record<SettingsSectionId, React.ReactNode> = {
  usage: <ChartNoAxesCombined size={18} />,
  providers: <Cloud size={18} />,
  extensions: <Puzzle size={18} />,
  mcp: <Box size={18} />,
  themes: <Paintbrush size={18} />,
  systemprompt: <FileText size={18} />,
}

const navItems = SETTINGS_SECTIONS.map((section) => ({
  id: section.id,
  label: section.navLabel,
  icon: settingsIcons[section.id],
}))

function SidebarSettingsView({
  active,
  activeSettingsSection,
  onNavigateSettings,
}: SidebarSettingsViewProps) {
  return (
    <div className={`sidebar-view sidebar-view--settings ${active ? 'active' : 'inactive'}`}>
      <div className="sidebar-settings-content">
        {navItems.map((item, index) => (
          <button
            key={item.id}
            onClick={() => onNavigateSettings(item.id)}
            className={`sidebar-nav-item sidebar-nav-item--settings sidebar-animate-item ${activeSettingsSection === item.id ? 'active' : ''}`}
            style={{
              fontSize: '0.9rem',
              justifyContent: 'flex-start',
              animationDelay: `${index * 0.05}s`,
              minWidth: 0,
              overflow: 'hidden',
              width: '100%',
            }}
          >
            <div className="sidebar-nav-item__icon">{item.icon}</div>
            <span className="sidebar-nav-item__label">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default React.memo(SidebarSettingsView)
