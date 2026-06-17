import { describe, expect, it } from 'vitest'
import { BACKUP_VERSION, validateDataBackup } from './backup'

describe('validateDataBackup', () => {
  it('accepts a well-formed plain-JSON backup', () => {
    const text = JSON.stringify({
      version: BACKUP_VERSION,
      exportedAt: 1718900000000,
      data: { buildings: [{ id: 'b1' }], workers: [] },
    })
    const out = validateDataBackup(text)
    expect(out.version).toBe(BACKUP_VERSION)
    expect(out.exportedAt).toBe(1718900000000)
    expect(out.data.buildings).toHaveLength(1)
  })

  it('rejects non-JSON', () => {
    expect(() => validateDataBackup('not json')).toThrow(/not valid JSON/i)
  })

  it('rejects a JSON array (not an object)', () => {
    expect(() => validateDataBackup('[]')).toThrow(/not a JSON object/i)
  })

  it('guides the user when handed an encrypted envelope', () => {
    const text = JSON.stringify({ app: 'x', ciphertext: 'abc', cipher: { iv: 'z' } })
    expect(() => validateDataBackup(text)).toThrow(/encrypted backup/i)
  })

  it('rejects a missing numeric version', () => {
    const text = JSON.stringify({ data: { buildings: [] } })
    expect(() => validateDataBackup(text)).toThrow(/version/i)
  })

  it('rejects a version newer than supported', () => {
    const text = JSON.stringify({ version: BACKUP_VERSION + 5, data: { buildings: [] } })
    expect(() => validateDataBackup(text)).toThrow(/newer than this app supports/i)
  })

  it('reports the keys it saw when data has no known tables', () => {
    const text = JSON.stringify({ version: 1, data: { foo: [], bar: [] } })
    expect(() => validateDataBackup(text)).toThrow(/saw: foo, bar/i)
  })
})
