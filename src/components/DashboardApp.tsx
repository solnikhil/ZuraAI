import { lazy, Suspense } from 'react'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'

import AgentSkillsSync from './AgentSkillsSync'
import NotificationSettingsSync from './NotificationSettingsSync'
import MonitorSummarySync from './MonitorSummarySync'
import AutomationRunSync from './AutomationRunSync'
import DashboardLayout from './Dashboard/Layout'
import AppShellLayout from './AppShellLayout'
import AppShellRouteHost from './AppShellRouteHost'
import NotFound404 from './ui/demo'
import AppLoadingFallback from './AppLoadingFallback'
import {
  CodeExecutionApprovalHost,
  ComputerUseApprovalHost,
  TerminalApprovalHost,
} from './AppApprovalHosts'
import { SettingsProvider } from '../contexts/SettingsContext'
import { ChatHistoryProvider } from '../contexts/ChatHistoryContext'
import { StreamingProvider } from '../contexts/StreamingContext'
import { QuickSendProvider } from '../contexts/QuickSendContext'
import { ComposerDraftProvider } from '../contexts/ComposerDraftContext'
import { ModelSelectorProvider } from '../contexts/ModelSelectorContext'
import { McpProvider } from '../mcp/McpContext'
import { McpApprovalDialog } from './mcp/McpApprovalDialog'
import { AnalyticsConsentPrompt } from './AnalyticsConsentPrompt'
import { AgentToolApprovalProvider } from '../agent/AgentToolApprovalContext'
import { loadSettingsModule } from './Settings/settingsLoader'

const Settings = lazy(loadSettingsModule)

export default function DashboardApp() {
  return (
    <SettingsProvider>
      <McpProvider>
        <ChatHistoryProvider>
          <StreamingProvider>
            <QuickSendProvider>
              <ComposerDraftProvider>
                <AgentToolApprovalProvider>
                  <ModelSelectorProvider>
                    <AgentSkillsSync />
                    <NotificationSettingsSync />
                    <MonitorSummarySync />
                    <AutomationRunSync />
                    <Router>
                      <Routes>
                        <Route element={<AppShellRouteHost />}>
                          <Route element={<AppShellLayout />}>
                            <Route path="/" element={<DashboardLayout />} />
                            <Route path="/dashboard" element={<DashboardLayout />} />
                            <Route
                              path="/settings"
                              element={
                                <Suspense fallback={<AppLoadingFallback />}>
                                  <Settings />
                                </Suspense>
                              }
                            />
                            <Route path="/chat" element={<DashboardLayout />} />
                          </Route>
                          <Route path="*" element={<NotFound404 />} />
                        </Route>
                      </Routes>
                    </Router>
                    <McpApprovalDialog />
                    <AnalyticsConsentPrompt />
                  </ModelSelectorProvider>
                </AgentToolApprovalProvider>
                <CodeExecutionApprovalHost />
                <TerminalApprovalHost />
                <ComputerUseApprovalHost />
              </ComposerDraftProvider>
            </QuickSendProvider>
          </StreamingProvider>
        </ChatHistoryProvider>
      </McpProvider>
    </SettingsProvider>
  )
}
