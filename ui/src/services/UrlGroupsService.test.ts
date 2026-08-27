// InstaDesk — UrlGroupsService behaviour (I-2/I-3 of the URL Group Editing plan).
//
// F-1: identity is keyed two different ways.
//
//   addUrlGroup       de-dupes on (name, browser)
//   findUrlGroupByName matches on  name  alone   <- resolves assignments at launch
//
// Phase 0 derived the consequence by READING the code. That is not a measurement,
// so these tests exist to settle it mechanically: they describe the behaviour the
// app SHOULD have and are expected to fail until I-3 makes both paths agree.
//
// Why "name alone" is the correct single key, rather than teaching the lookup
// about browsers: a grid assignment stores only the group's NAME
// (layoutBuilder.resolveAppTarget is handed an app-name string and calls
// findUrlGroupByName with it). The name is therefore already the identity in the
// saved data. Making the de-dupe agree with that is a one-line change; making the
// lookup browser-aware would require every stored assignment to start carrying a
// browser, which is a data migration.
import { describe, it, expect, beforeEach } from 'vitest'
import { addUrlGroup, listUrlGroups, findUrlGroupByName, clearUrlGroups } from './UrlGroupsService'

const CHROME_URL = 'https://chrome.example.com/dashboard'
const EDGE_URL = 'https://edge.example.com/dashboard'

describe('F-1 — one name must mean one group', () => {
  beforeEach(() => clearUrlGroups())

  it('re-saving a name with a DIFFERENT browser replaces it, instead of making a twin', () => {
    addUrlGroup({ name: 'Dashboards', browser: 'Chrome', urls: [CHROME_URL] })
    addUrlGroup({ name: 'Dashboards', browser: 'Edge', urls: [EDGE_URL] })

    // Today this is 2: the de-dupe compares browsers, so it does not fire.
    expect(listUrlGroups()).toHaveLength(1)
  })

  it('the surviving group is the one the user saved LAST', () => {
    addUrlGroup({ name: 'Dashboards', browser: 'Chrome', urls: [CHROME_URL] })
    addUrlGroup({ name: 'Dashboards', browser: 'Edge', urls: [EDGE_URL] })

    const found = findUrlGroupByName('Dashboards')
    expect(found).not.toBeNull()
    // Today this is 'Chrome': findUrlGroupByName returns the FIRST match in
    // insertion order, which is the record the user replaced, not the one they
    // just saved. So the app launches the browser they thought they had changed.
    expect(found!.browser).toBe('Edge')
    expect(found!.urls).toEqual([EDGE_URL])
  })

  it('no saved group is unreachable — every stored group can be resolved by name', () => {
    addUrlGroup({ name: 'Dashboards', browser: 'Chrome', urls: [CHROME_URL] })
    addUrlGroup({ name: 'Dashboards', browser: 'Edge', urls: [EDGE_URL] })

    // This is the user-visible harm, stated directly: a record that is listed in
    // App History but that no Layout can ever launch. Whatever findUrlGroupByName
    // does NOT return is dead storage the user can still see and believe in.
    const unreachable = listUrlGroups().filter(
      g => findUrlGroupByName(g.name)?.id !== g.id,
    )
    expect(unreachable).toEqual([])
  })

  it('matching an existing name+browser still updates in place (must not regress)', () => {
    // Guards the behaviour that already works, so the I-3 fix cannot quietly
    // break the one editing path that exists today.
    const first = addUrlGroup({ name: 'Research', browser: 'Chrome', urls: ['https://a.example'] })
    const second = addUrlGroup({ name: 'Research', browser: 'Chrome', urls: ['https://b.example'] })

    expect(listUrlGroups()).toHaveLength(1)
    expect(second.id).toBe(first.id)          // same record, not a replacement
    expect(second.urls).toEqual(['https://b.example'])
  })

  it('name matching is case-insensitive, and stays that way', () => {
    addUrlGroup({ name: 'Research', browser: 'Chrome', urls: ['https://a.example'] })
    addUrlGroup({ name: 'RESEARCH', browser: 'Chrome', urls: ['https://b.example'] })

    expect(listUrlGroups()).toHaveLength(1)
    expect(findUrlGroupByName('research')).not.toBeNull()
  })

  it('different names remain different groups', () => {
    // The negative direction: the I-3 fix must not collapse everything into one.
    addUrlGroup({ name: 'Research', browser: 'Chrome', urls: ['https://a.example'] })
    addUrlGroup({ name: 'Dashboards', browser: 'Chrome', urls: ['https://b.example'] })

    expect(listUrlGroups()).toHaveLength(2)
    expect(findUrlGroupByName('Research')!.urls).toEqual(['https://a.example'])
    expect(findUrlGroupByName('Dashboards')!.urls).toEqual(['https://b.example'])
  })
})
