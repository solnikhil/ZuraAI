export const ONLINE_COMPILER_API_URL = 'https://api.onlinecompiler.io/api/run-code-sync/'
export const ONLINE_COMPILER_FETCH_TIMEOUT_MS = 35_000
export const EXEC_MAX_CODE_LENGTH = 50_000
// OnlineCompiler API caps output at ~999 chars — this is a provider-side limitation
export const EXEC_MAX_OUTPUT_LENGTH = 999

export const COMPILER_MAP: Record<string, { compiler: string }> = {
  javascript: { compiler: 'typescript-deno' },
  python: { compiler: 'python-3.14' },
}
