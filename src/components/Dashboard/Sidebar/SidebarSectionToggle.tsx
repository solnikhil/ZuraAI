import React from 'react'
import { ChevronDown, Pin } from '../../icons'

interface SidebarSectionToggleProps {
  label: string
  icon?: 'pin'
  isOpen: boolean
  onToggle: () => void
}

export function SidebarSectionToggle({
  label,
  icon,
  isOpen,
  onToggle,
}: SidebarSectionToggleProps): React.ReactElement {
  return (
    <div
      className="sidebar-section-label"
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggle()
        }
      }}
      role="button"
      tabIndex={0}
      aria-expanded={isOpen}
      aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${label}`}
    >
      {icon === 'pin' && <Pin size={11} className="sidebar-section-label__icon" />}
      <span className="sidebar-section-label__name">{label}</span>
      <ChevronDown
        size={10}
        className={`sidebar-section-label__chevron ${isOpen ? 'sidebar-section-label__chevron--open' : 'sidebar-section-label__chevron--closed'}`}
      />
    </div>
  )
}
