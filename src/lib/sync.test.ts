import { describe, expect, it } from 'vitest'
import { extractConstruction } from './sync'

// Mirrors FinSight's `dumpAll()` export: every table nested under `data`,
// numeric category ids, the string "Construction" only in `categories`,
// amount always positive with direction in `txnType`, dateTime in epoch ms.
function finsightBackup() {
  return JSON.stringify({
    version: 1,
    exportedAt: 1718900000000,
    data: {
      users: [],
      profiles: [{ id: 1 }],
      accounts: [],
      categories: [
        { id: 21, name: 'Construction', parentId: null, type: 'expense' },
        { id: 25, name: 'Cement', parentId: 21, type: 'expense' },
        { id: 26, name: 'Wage', parentId: 21, type: 'expense' },
        { id: 27, name: 'Owner Receipts', parentId: 21, type: 'income' },
        { id: 30, name: 'Groceries', parentId: null, type: 'expense' }, // unrelated
        { id: 31, name: 'Milk', parentId: 30, type: 'expense' }, // unrelated child
      ],
      transactions: [
        // child of Construction (subCategoryId = leaf)
        {
          id: 42,
          slNo: 42,
          dateTime: 1718900000000,
          categoryId: 21,
          subCategoryId: 25,
          amount: 15000,
          txnType: 'debit',
          description: 'Cement purchase',
          importFingerprint: 'fp-cement',
        },
        // owner receipt — money in
        {
          id: 43,
          slNo: 43,
          dateTime: 1718900500000,
          categoryId: 21,
          subCategoryId: 27,
          amount: 50000,
          txnType: 'credit',
          description: 'Owner advance',
        },
        // filed directly on the top-level Construction category (no sub)
        {
          id: 44,
          slNo: 44,
          dateTime: 1718900900000,
          categoryId: 21,
          subCategoryId: null,
          amount: 2000,
          txnType: 'debit',
        },
        // unrelated txn — must be ignored
        {
          id: 99,
          slNo: 99,
          dateTime: 1718901000000,
          categoryId: 30,
          subCategoryId: 31,
          amount: 300,
          txnType: 'debit',
        },
      ],
    },
  })
}

describe('extractConstruction (FinSight dumpAll shape)', () => {
  const rows = extractConstruction(finsightBackup())

  it('joins by id and keeps only Construction (incl. its children)', () => {
    expect(rows.map((r) => r.id).sort()).toEqual(['42', '43', '44'])
  })

  it('resolves the leaf sub-category name → our type (known names auto-match)', () => {
    const cement = rows.find((r) => r.id === '42')!
    expect(cement.typeName).toBe('Cement')
    // "Cement" isn't a known name → falls back to OtherExpense (user remaps it
    // in Settings → Category mapping).
    expect(cement.subCategory).toBe('OtherExpense')
    const owner = rows.find((r) => r.id === '43')!
    expect(owner.typeName).toBe('Owner Receipts')
    expect(owner.subCategory).toBe('OwnerReceipt')
  })

  it('reads direction from txnType and keeps amount positive', () => {
    expect(rows.find((r) => r.id === '42')!.direction).toBe('debit')
    expect(rows.find((r) => r.id === '43')!.direction).toBe('credit')
    expect(rows.every((r) => r.amount > 0)).toBe(true)
  })

  it('converts epoch-ms dateTime to an ISO date', () => {
    const r = rows.find((r) => r.id === '42')!
    expect(r.date).toBe(new Date(1718900000000).toISOString().slice(0, 10))
    expect(r.dateTime).toBe(1718900000000)
  })

  it('keeps txns filed directly on the Construction category (subCategoryId null)', () => {
    expect(rows.some((r) => r.id === '44')).toBe(true)
  })
})

describe('extractConstruction — Construction matched dynamically by name', () => {
  it('finds Construction regardless of its id', () => {
    const backup = JSON.stringify({
      data: {
        categories: [
          { id: 7, name: 'construction', parentId: null },
          { id: 8, name: 'Transport', parentId: 7 },
        ],
        transactions: [
          { id: 1, categoryId: 7, subCategoryId: 8, amount: 500, txnType: 'debit' },
        ],
      },
    })
    const rows = extractConstruction(backup)
    expect(rows).toHaveLength(1)
    expect(rows[0].subCategory).toBe('Transport')
  })
})

describe('extractConstruction — descriptive diagnostics (never silent)', () => {
  it('throws and lists top-level categories when Construction is absent', () => {
    const backup = JSON.stringify({
      data: {
        categories: [
          { id: 1, name: 'Groceries', parentId: null },
          { id: 2, name: 'Salary', parentId: null },
        ],
        transactions: [{ id: 9, categoryId: 1, amount: 100, txnType: 'debit' }],
      },
    })
    expect(() => extractConstruction(backup)).toThrow(/No "Construction" category/i)
    expect(() => extractConstruction(backup)).toThrow(/Groceries, Salary/)
  })

  it('throws an unexpected-shape message naming top-level keys when there is no data', () => {
    const backup = JSON.stringify({ foo: 1, bar: 2 })
    expect(() => extractConstruction(backup)).toThrow(/Top-level keys: foo, bar/i)
  })

  it('throws when data lacks categories/transactions', () => {
    const backup = JSON.stringify({ data: { users: [], accounts: [] } })
    expect(() => extractConstruction(backup)).toThrow(/missing categories and transactions/i)
  })

  it('throws on invalid JSON', () => {
    expect(() => extractConstruction('{ not json')).toThrow(/not valid JSON/i)
  })
})

