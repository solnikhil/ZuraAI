/**
 * Boundary transforms between persisted MCP configs, editable secret placeholders,
 * and the narrow payload sent to main. Raw stored secrets are never reconstructed here.
 */
export {
  draftServerToInputPayload,
  isDraftServerEqualToLiveServer,
  mcpServerToDraftServer,
} from './draftCore'
