const tokensByToolCallId = new Map<string, string>()

export function rememberToolApprovalToken(toolCallId: string, token: string): void {
  if (toolCallId && token) tokensByToolCallId.set(toolCallId, token)
}

export function consumeToolApprovalToken(toolCallId: string): string | undefined {
  const token = tokensByToolCallId.get(toolCallId)
  tokensByToolCallId.delete(toolCallId)
  return token
}
