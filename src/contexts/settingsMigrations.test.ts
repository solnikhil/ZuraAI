import { describe, expect, it } from 'vitest'
import v0Fixture from './__fixtures__/settings-migrations/v0-legacy.json'
import v1Fixture from './__fixtures__/settings-migrations/v1-models.json'
import v2Fixture from './__fixtures__/settings-migrations/v2-ui.json'
import {
  SETTINGS_MIGRATIONS,
  SETTINGS_SCHEMA_VERSION,
  migrateStoredSettingsRecord,
  type StoredSettingsRecord,
} from './settingsMigrations'

const fixtures = [v0Fixture, v1Fixture, v2Fixture]

describe('settings migrations', () => {
  it('forms a contiguous numbered chain to the current schema', () => {
    expect(SETTINGS_MIGRATIONS.map(({ from, to }) => [from, to])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ])
    expect(SETTINGS_MIGRATIONS.at(-1)?.to).toBe(SETTINGS_SCHEMA_VERSION)
  })

  it.each(fixtures)('migrates a stored fixture to the current schema', ({ input, expected }) => {
    expect(migrateStoredSettingsRecord(input as StoredSettingsRecord)).toEqual(expected)
  })

  it.each(fixtures)('is idempotent for a migrated fixture', ({ input }) => {
    const once = migrateStoredSettingsRecord(input as StoredSettingsRecord)
    expect(migrateStoredSettingsRecord(once)).toEqual(once)
  })

  it('does not downgrade settings written by a newer application version', () => {
    const future = { settingsSchemaVersion: 99, futurePreference: true }
    expect(migrateStoredSettingsRecord(future)).toEqual(future)
  })

  it('strips retired renderer approval authority from current-version records', () => {
    expect(
      migrateStoredSettingsRecord({
        settingsSchemaVersion: SETTINGS_SCHEMA_VERSION,
        codeExecutionAutoApprove: true,
        terminalAutoApprove: true,
        computerUseAutoApprove: true,
      })
    ).toEqual({ settingsSchemaVersion: SETTINGS_SCHEMA_VERSION })
  })
})
