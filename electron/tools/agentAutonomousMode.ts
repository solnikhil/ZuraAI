import { getSecureValueAsync, setSecureValueAsync } from '../secureStorage'

const AUTONOMOUS_MODE_KEY = 'agentAutonomousModeEnabled'

let cachedEnabled: boolean | null = null

export async function isAgentAutonomousModeEnabled(): Promise<boolean> {
  if (cachedEnabled !== null) return cachedEnabled
  cachedEnabled = (await getSecureValueAsync(AUTONOMOUS_MODE_KEY)) === 'enabled'
  return cachedEnabled
}

export async function setAgentAutonomousModeEnabled(enabled: boolean): Promise<boolean> {
  const persisted = await setSecureValueAsync(AUTONOMOUS_MODE_KEY, enabled ? 'enabled' : '')
  if (!persisted) throw new Error('Fully autonomous mode could not be persisted securely.')
  cachedEnabled = enabled
  return enabled
}

export function resetAgentAutonomousModeCacheForTests(): void {
  cachedEnabled = null
}
