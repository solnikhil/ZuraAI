import CommandCenterOverlay from './CommandCenterOverlay'
import {
  CodeExecutionApprovalHost,
  ComputerUseApprovalHost,
  TerminalApprovalHost,
} from './AppApprovalHosts'
import { AgentToolApprovalProvider } from '../agent/AgentToolApprovalContext'
import { ChatHistoryProvider } from '../contexts/ChatHistoryContext'
import { ComposerDraftProvider } from '../contexts/ComposerDraftContext'
import { ModelSelectorProvider } from '../contexts/ModelSelectorContext'
import { QuickSendProvider } from '../contexts/QuickSendContext'
import { SettingsProvider } from '../contexts/SettingsContext'
import { StreamingProvider } from '../contexts/StreamingContext'
import { McpProvider } from '../mcp/McpContext'
import { McpApprovalDialog } from './mcp/McpApprovalDialog'

export default function CommandCenterApp() {
  return (
    <SettingsProvider>
      <McpProvider>
        <ChatHistoryProvider>
          <StreamingProvider>
            <QuickSendProvider>
              <ComposerDraftProvider>
                <AgentToolApprovalProvider>
                  <ModelSelectorProvider>
                    <CommandCenterOverlay />
                    <McpApprovalDialog />
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
