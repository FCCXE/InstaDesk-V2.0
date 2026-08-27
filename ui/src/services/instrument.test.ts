// InstaDesk — test-instrument control (I-1 of the URL Group Editing plan).
//
// This file tests the HARNESS, not the product. It exists because of a rule this
// programme has paid for twice: an instrument nobody has seen FAIL proves nothing,
// and a gate can certify code it never ran.
//
// Until 2026-08-27 the UI had no test runner at all — the Rust side had 26 tests,
// the UI had zero. So the first question is not "does the service behave?" but
// "can a test in this repo even SEE the service?".
//
// The positive control below therefore does not assert `true === true`. It drives
// the REAL UrlGroupsService through the REAL storage module and checks a value
// came back, which is the only thing that proves the harness reaches production
// code rather than a mock of it.
//
// The matching NEGATIVE control is not committed: it is written, run, observed to
// go red, and removed — with the red output recorded in the work plan. A control
// that lives in the file forever would just be a test that fails.
import { describe, it, expect, beforeEach } from 'vitest'
import { addUrlGroup, listUrlGroups, clearUrlGroups, removeUrlGroup } from './UrlGroupsService'

describe('test instrument', () => {
  beforeEach(() => {
    // UrlGroupsService persists through services/storage, which falls back to a
    // module-level Map when `window` is absent. That Map is shared across tests
    // in this process, so state must be cleared explicitly or tests leak into
    // each other and later assertions read earlier writes.
    clearUrlGroups()
  })

  it('reaches the real UrlGroupsService and the real storage fallback', () => {
    // If the harness were mocking the module, or storage silently swallowed the
    // write, this round-trip would come back empty.
    expect(listUrlGroups()).toEqual([])

    addUrlGroup({ name: 'Instrument', browser: 'Chrome', urls: ['https://example.com'] })

    const list = listUrlGroups()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Instrument')
    expect(list[0].urls).toEqual(['https://example.com'])
    // An id and a timestamp are minted by the service, not supplied by the test —
    // more evidence that production code, not a fixture, produced this record.
    expect(list[0].id).toBeTruthy()
    expect(list[0].createdAt).toBeGreaterThan(0)
  })

  it('clears between tests, so one test cannot read another test state', () => {
    // Guards the beforeEach above. Without isolation, the previous test's
    // "Instrument" group would still be here and every later count would be wrong.
    expect(listUrlGroups()).toEqual([])
  })

  it('surfaces the service own validation rather than swallowing it', () => {
    // A harness that swallowed exceptions would make every future negative test
    // vacuously green.
    expect(() => addUrlGroup({ name: '', browser: 'Chrome', urls: ['https://x.com'] })).toThrow()
    expect(() => addUrlGroup({ name: 'X', browser: 'Chrome', urls: [] })).toThrow()
  })

  it('removeUrlGroup actually removes, so cleanup in later tests is trustworthy', () => {
    const g = addUrlGroup({ name: 'Temp', browser: 'Chrome', urls: ['https://x.com'] })
    expect(listUrlGroups()).toHaveLength(1)
    removeUrlGroup(g.id)
    expect(listUrlGroups()).toHaveLength(0)
  })
})
