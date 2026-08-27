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
import { addUrlGroup, listUrlGroups, findUrlGroupByName, clearUrlGroups, updateUrlGroup, groupToDraft } from './UrlGroupsService'
import { safeSet } from './storage'

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

  it('LEGACY data that already contains twins still resolves deterministically', () => {
    // The fix to addUrlGroup stops NEW twins being created. It cannot un-create
    // the ones already sitting in a user's storage, and deleting them silently
    // would break invariant U-1 (no group is ever lost without being told).
    //
    // So the lookup must be deterministic on data it did not create. Insertion
    // order is not deterministic in any sense the user can predict — "the one I
    // saved most recently" is. This writes twins straight past the service, the
    // way a pre-fix build would have left them.
    safeSet('insta.urlgroups.v1', [
      { id: 'old', name: 'Dashboards', browser: 'Chrome', urls: [CHROME_URL], createdAt: 1000 },
      { id: 'new', name: 'Dashboards', browser: 'Edge', urls: [EDGE_URL], createdAt: 2000 },
    ])

    const found = findUrlGroupByName('Dashboards')
    expect(found!.id).toBe('new')            // most recently saved wins
    expect(found!.browser).toBe('Edge')
    // and nothing was deleted behind the user's back
    expect(listUrlGroups()).toHaveLength(2)
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

// I-4. Editing an existing group, addressed by ID.
//
// By id and never by name, deliberately. addUrlGroup already keys on the name, and
// that is right for a SAVE from the builder — but an edit is a different act: it
// means "change this record", not "change whatever currently answers to this
// name". Routing an edit through the name would make it silently create a new
// group the moment the name in the builder drifted, which is the shadow-group
// defect (F-1) arriving by a second door.
//
// The NAME is deliberately not updatable here. Assignments in saved Layouts
// reference a group by name (F-2), so renaming is a cascade across stored data and
// is out of this front's scope by invariant U-3. The browser IS updatable: the
// builder shows a browser picker, so ignoring a change the user can see themselves
// make would be a fresh lie, and it is safe now that F-1 is fixed.
describe('I-4 — updateUrlGroup', () => {
  beforeEach(() => clearUrlGroups())

  it('replaces the URL list of the addressed group', () => {
    const g = addUrlGroup({ name: 'Research', browser: 'Chrome', urls: ['https://a.example'] })
    const updated = updateUrlGroup(g.id, { urls: ['https://b.example', 'https://c.example'] })

    expect(updated).not.toBeNull()
    expect(updated!.urls).toEqual(['https://b.example', 'https://c.example'])
    expect(listUrlGroups()).toHaveLength(1)
  })

  it('keeps the id and the name — an edit is not a re-creation', () => {
    const g = addUrlGroup({ name: 'Research', browser: 'Chrome', urls: ['https://a.example'] })
    const updated = updateUrlGroup(g.id, { urls: ['https://b.example'] })

    expect(updated!.id).toBe(g.id)
    expect(updated!.name).toBe('Research')
    // createdAt is preserved so an edit does not reshuffle App History under the
    // user while they are working in it (listUrlGroups sorts newest-first).
    expect(updated!.createdAt).toBe(g.createdAt)
    // The name is what Layouts reference, so an edit must leave it resolvable.
    expect(findUrlGroupByName('Research')!.id).toBe(g.id)
  })

  it('can change the browser, because the builder lets the user change it', () => {
    const g = addUrlGroup({ name: 'Research', browser: 'Chrome', urls: ['https://a.example'] })
    const updated = updateUrlGroup(g.id, { urls: ['https://a.example'], browser: 'Edge' })

    expect(updated!.browser).toBe('Edge')
    expect(listUrlGroups()).toHaveLength(1)   // changed, not twinned
  })

  it('an unknown id changes nothing and reports it', () => {
    addUrlGroup({ name: 'Research', browser: 'Chrome', urls: ['https://a.example'] })
    const before = JSON.stringify(listUrlGroups())

    expect(updateUrlGroup('no-such-id', { urls: ['https://z.example'] })).toBeNull()
    expect(JSON.stringify(listUrlGroups())).toBe(before)
  })

  it('refuses an empty URL list, exactly as addUrlGroup does', () => {
    // Two doors into one store must not disagree about what is valid, or the
    // invariant addUrlGroup enforces is one edit away from being void.
    const g = addUrlGroup({ name: 'Research', browser: 'Chrome', urls: ['https://a.example'] })
    expect(() => updateUrlGroup(g.id, { urls: [] })).toThrow()
    expect(() => updateUrlGroup(g.id, { urls: ['   ', ''] })).toThrow()
    // and the original survives the refusal
    expect(findUrlGroupByName('Research')!.urls).toEqual(['https://a.example'])
  })

  it('trims and drops blank URLs, exactly as addUrlGroup does', () => {
    const g = addUrlGroup({ name: 'Research', browser: 'Chrome', urls: ['https://a.example'] })
    const updated = updateUrlGroup(g.id, { urls: ['  https://b.example  ', '', '   '] })
    expect(updated!.urls).toEqual(['https://b.example'])
  })

  it('leaves every other group untouched', () => {
    const a = addUrlGroup({ name: 'Research', browser: 'Chrome', urls: ['https://a.example'] })
    addUrlGroup({ name: 'Dashboards', browser: 'Edge', urls: ['https://d.example'] })

    updateUrlGroup(a.id, { urls: ['https://changed.example'] })

    expect(listUrlGroups()).toHaveLength(2)
    expect(findUrlGroupByName('Dashboards')!.urls).toEqual(['https://d.example'])
    expect(findUrlGroupByName('Dashboards')!.browser).toBe('Edge')
  })
})

// I-5. Loading a saved group back into the builder.
//
// This is the DRY RUN the work plan requires: the mapping is proven to round-trip
// before a single button is wired to it. Without this step, "edit" would still
// mean "retype from memory" — the builder draft is in-memory only, so a saved
// group has never been loadable back into it.
//
// The round-trip is the whole safety property. If saved -> draft -> saved is not
// the identity on the URL list, then opening a group for editing and saving it
// unchanged would quietly alter the user's data — a way to lose configuration
// while appearing to do nothing, which is the exact complaint this front exists
// to answer (invariant U-1).
describe('I-5 — group loads back into an editable draft', () => {
  beforeEach(() => clearUrlGroups())

  it('maps a saved group onto one draft tab group, faithfully', () => {
    const g = addUrlGroup({
      name: 'Research',
      browser: 'Chrome',
      urls: ['https://a.example', 'https://b.example', 'https://c.example'],
    })

    const draft = groupToDraft(g)
    expect(draft.browser).toBe('Chrome')
    expect(draft.tabGroups).toHaveLength(1)
    expect(draft.tabGroups[0].title).toBe('Research')
    expect(draft.tabGroups[0].urls).toEqual([
      'https://a.example',
      'https://b.example',
      'https://c.example',
    ])
  })

  it('ROUND TRIP: opening a group and saving it unchanged alters nothing', () => {
    const g = addUrlGroup({
      name: 'Research',
      browser: 'Chrome',
      urls: ['https://a.example', 'https://b.example'],
    })
    const before = JSON.stringify(listUrlGroups())

    const draft = groupToDraft(g)
    const saved = updateUrlGroup(g.id, {
      urls: draft.tabGroups[0].urls,
      browser: draft.browser,
    })

    expect(saved!.urls).toEqual(g.urls)
    expect(saved!.browser).toBe(g.browser)
    expect(saved!.name).toBe(g.name)
    expect(saved!.id).toBe(g.id)
    // The strongest form of the assertion: the whole store is byte-identical.
    expect(JSON.stringify(listUrlGroups())).toBe(before)
  })

  it('round-trips URLs that carry query strings and fragments', () => {
    // Real URL groups are dashboards and consoles, not bare origins. A mapping
    // that mangled a query string would corrupt exactly the URLs users care about.
    const messy = [
      'https://eu.posthog.com/project/201378/dashboard?tab=usage&range=30d',
      'https://sentry.io/issues/127755/?query=is%3Aunresolved#event-1',
    ]
    const g = addUrlGroup({ name: 'Consoles', browser: 'Chrome', urls: messy })

    const draft = groupToDraft(g)
    const saved = updateUrlGroup(g.id, { urls: draft.tabGroups[0].urls })
    expect(saved!.urls).toEqual(messy)
  })

  it('the draft carries the group id, so the save knows WHICH record to edit', () => {
    // Without this the wiring would have to match by name, which is the second
    // door onto the shadow-group defect that I-4 exists to keep shut.
    const g = addUrlGroup({ name: 'Research', browser: 'Chrome', urls: ['https://a.example'] })
    expect(groupToDraft(g).tabGroups[0].id).toBe(g.id)
  })
})
