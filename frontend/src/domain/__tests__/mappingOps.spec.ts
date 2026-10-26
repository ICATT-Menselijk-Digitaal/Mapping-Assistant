import { describe, expect, it } from 'vitest'
import { buildSchema } from '@/domain/schema'
import type { FieldMapping } from '@/types/mapping'
import type { ExportedFieldMapping } from '@/utils/exportSerializer'
import { formatAmsterdamTime } from '@/utils/amsterdamTime'
import {
  addAlternativeStorageCoupling,
  addDefaultValueCoupling,
  addMapping,
  alternativeStorageName,
  findCasingVariant,
  hasCouplingForSource,
  setAlternativeStorage,
  usedAlternativeStorageNames,
  addRule,
  hasCouplingForTarget,
  makeMapping,
  MAX_COMMENT_LENGTH,
  removeComment,
  removeMapping,
  removeRule,
  restoreMappings,
  setComment,
  toggleMismatch,
  updateRule,
} from '../mappingOps'

function base(): FieldMapping {
  return makeMapping({ sourceFieldId: 's1', targetFieldId: 't1' })
}

describe('mappingOps', () => {
  it('addMapping appends and returns the created mapping', () => {
    const { list, created } = addMapping([], { sourceFieldId: 's1', targetFieldId: 't1' })
    expect(created).not.toBeNull()
    expect(created!.status).toBe('confirmed')
    expect(list).toHaveLength(1)
  })

  it('addMapping rejects a duplicate source→target pair', () => {
    const first = addMapping([], { sourceFieldId: 's1', targetFieldId: 't1' })
    const second = addMapping(first.list, { sourceFieldId: 's1', targetFieldId: 't1' })
    expect(second.created).toBeNull()
    expect(second.list).toHaveLength(1)
  })

  // PR #189 review: a target is covered by at most one coupling, so this now
  // also rejects a DIFFERENT source mapping to an already-covered target —
  // not just an exact duplicate pair.
  it('addMapping rejects a different source mapping to an already-mapped target', () => {
    const first = addMapping([], { sourceFieldId: 's1', targetFieldId: 't1' })
    const second = addMapping(first.list, { sourceFieldId: 's2', targetFieldId: 't1' })
    expect(second.created).toBeNull()
    expect(second.list).toHaveLength(1)
  })

  it('addMapping rejects a source mapping to a target that already has a default-value coupling', () => {
    const { list } = addDefaultValueCoupling([], { targetFieldId: 't1' })
    const result = addMapping(list, { sourceFieldId: 's1', targetFieldId: 't1' })
    expect(result.created).toBeNull()
    expect(result.list).toHaveLength(1)
    expect(result.list[0]!.sourceFieldId).toBeNull()
  })

  it('addMapping does not mutate the input list', () => {
    const input: FieldMapping[] = []
    addMapping(input, { sourceFieldId: 's1', targetFieldId: 't1' })
    expect(input).toEqual([])
  })

  it('removeMapping drops the mapping by id', () => {
    const m = base()
    expect(removeMapping([m], m.id)).toEqual([])
  })

  it('addRule / updateRule / removeRule edit a mapping immutably and keep rule ids', () => {
    const m = base()
    let list = addRule([m], m.id, { expression: '$', label: 'identity', source: 'manual' })
    const ruleId = list[0]!.transformations[0]!.id

    list = updateRule(list, m.id, ruleId, { label: 'renamed', id: 'should-be-ignored' as never })
    expect(list[0]!.transformations[0]!.id).toBe(ruleId)
    expect(list[0]!.transformations[0]!.label).toBe('renamed')

    list = removeRule(list, m.id, ruleId)
    expect(list[0]!.transformations).toEqual([])
  })

  it('toggleMismatch adds then removes a manual resolution', () => {
    const m = base()
    let list = toggleMismatch([m], m.id, 'truncate')
    expect(list[0]!.manuallyResolvedMismatches).toEqual(['truncate'])
    list = toggleMismatch(list, m.id, 'truncate')
    expect(list[0]!.manuallyResolvedMismatches).toEqual([])
  })

  it('restoreMappings flags mappings whose paths no longer resolve as orphaned', () => {
    const schema = buildSchema('s', [
      { id: 'a', name: 'a', path: 'a', dataType: 'string', required: false },
    ])
    const exported: ExportedFieldMapping[] = [
      { sourceField: 'a', targetField: 'a', transformations: [] },
      { sourceField: 'missing', targetField: 'a', transformations: [] },
    ]
    const restored = restoreMappings(exported, schema, schema)
    expect(restored[0]!.orphaned).toBeUndefined()
    expect(restored[1]!.orphaned).toBe(true)
  })

  // A source-less coupling is never orphaned on its source side — it never had one.
  it('restoreMappings does not flag a source-less coupling as orphaned', () => {
    const schema = buildSchema('s', [
      { id: 'a', name: 'a', path: 'a', dataType: 'string', required: false },
    ])
    const exported: ExportedFieldMapping[] = [
      {
        sourceField: null,
        targetField: 'a',
        transformations: [
          {
            expression: '"standaard"',
            label: 'Standaardwaarde: standaard',
            source: 'mismatch-solution',
            resolvesMismatch: 'missing-source',
          },
        ],
      },
    ]
    const [restored] = restoreMappings(exported, schema, schema)
    expect(restored!.sourceFieldId).toBeNull()
    expect(restored!.orphaned).toBeUndefined()
    expect(restored!.transformations[0]!.resolvesMismatch).toBe('missing-source')
  })

  it('restoreMappings still flags a source-less coupling as orphaned if its target path is gone', () => {
    const schema = buildSchema('s', [])
    const exported: ExportedFieldMapping[] = [
      { sourceField: null, targetField: 'missing', transformations: [] },
    ]
    const [restored] = restoreMappings(exported, schema, schema)
    expect(restored!.orphaned).toBe(true)
  })

  // Scenario: Importing an orphaned Koppeling still restores its comment
  it('restoreMappings carries a comment through even for an orphaned mapping', () => {
    const schema = buildSchema('s', [
      { id: 'a', name: 'a', path: 'a', dataType: 'string', required: false },
    ])
    const exported: ExportedFieldMapping[] = [
      {
        sourceField: 'missing',
        targetField: 'a',
        transformations: [],
        comment: 'Belangrijke context',
        commentedAt: '2026-01-01T00:00:00.000Z',
      },
    ]
    const [restored] = restoreMappings(exported, schema, schema)
    expect(restored!.orphaned).toBe(true)
    expect(restored!.comment).toBe('Belangrijke context')
    expect(restored!.commentedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('returns the SAME reference on a no-op (unknown id) so callers can skip the write', () => {
    const m = base()
    const list = addRule([m], m.id, { expression: '$', label: 'x', source: 'manual' })

    expect(removeMapping(list, 'missing')).toBe(list)
    expect(addRule(list, 'missing', { expression: '$', label: 'x', source: 'manual' })).toBe(list)
    expect(removeRule(list, m.id, 'missing-rule')).toBe(list)
    expect(updateRule(list, m.id, 'missing-rule', { label: 'x' })).toBe(list)
    expect(toggleMismatch(list, 'missing', 'truncate')).toBe(list)
    expect(setComment(list, 'missing', 'hi')).toBe(list)
    expect(removeComment(list, 'missing')).toBe(list)
  })

  describe('setComment / removeComment', () => {
    // Scenario: Adding a comment to a Koppeling
    it('setComment adds a comment and a commentedAt timestamp', () => {
      const m = base()
      const before = formatAmsterdamTime()
      const list = setComment([m], m.id, 'Belangrijke context')
      expect(list[0]!.comment).toBe('Belangrijke context')
      expect(list[0]!.commentedAt).toBeDefined()
      expect(list[0]!.commentedAt! >= before).toBe(true)
    })

    // Scenario: Editing an existing comment
    it('setComment overwrites an existing comment and refreshes commentedAt', () => {
      const m = base()
      const first = setComment([m], m.id, 'Eerste versie')
      const firstTimestamp = first[0]!.commentedAt
      const second = setComment(first, m.id, 'Tweede versie')
      expect(second[0]!.comment).toBe('Tweede versie')
      expect(second[0]!.commentedAt! >= firstTimestamp!).toBe(true)
    })

    // Scenario: Comment length is capped while composing
    it('setComment truncates to MAX_COMMENT_LENGTH', () => {
      const m = base()
      const tooLong = 'x'.repeat(MAX_COMMENT_LENGTH + 50)
      const list = setComment([m], m.id, tooLong)
      expect(list[0]!.comment).toHaveLength(MAX_COMMENT_LENGTH)
    })

    // Scenario: Removing an existing comment
    it('removeComment clears comment and commentedAt', () => {
      const m = base()
      const withComment = setComment([m], m.id, 'Weg ermee')
      const list = removeComment(withComment, m.id)
      expect(list[0]!.comment).toBeUndefined()
      expect(list[0]!.commentedAt).toBeUndefined()
    })

    it('removeComment is a no-op when the mapping has no comment', () => {
      const m = base()
      const list = [m]
      expect(removeComment(list, m.id)).toBe(list)
    })

    it('does not mutate the input list', () => {
      const m = base()
      const input = [m]
      setComment(input, m.id, 'x')
      expect(input[0]).toBe(m)
      expect(input[0]!.comment).toBeUndefined()
    })
  })

  it('returns a NEW reference when something actually changes', () => {
    const m = base()
    const list = [m]
    expect(removeMapping(list, m.id)).not.toBe(list)
    expect(addRule(list, m.id, { expression: '$', label: 'x', source: 'manual' })).not.toBe(list)
    expect(toggleMismatch(list, m.id, 'truncate')).not.toBe(list)
  })

  describe('addDefaultValueCoupling', () => {
    it('addDefaultValueCoupling appends a coupling with a null sourceFieldId', () => {
      const { list, created } = addDefaultValueCoupling([], { targetFieldId: 't1' })
      expect(created).not.toBeNull()
      expect(created!.sourceFieldId).toBeNull()
      expect(created!.targetFieldId).toBe('t1')
      expect(list).toHaveLength(1)
    })

    // Edge Case: Target field already has a coupling
    it('rejects a target that already has a source-bound coupling', () => {
      const { list } = addMapping([], { sourceFieldId: 's1', targetFieldId: 't1' })
      const result = addDefaultValueCoupling(list, { targetFieldId: 't1' })
      expect(result.created).toBeNull()
      expect(result.list).toHaveLength(1)
    })

    it('rejects a target that already has a default-value coupling', () => {
      const first = addDefaultValueCoupling([], { targetFieldId: 't1' })
      const second = addDefaultValueCoupling(first.list, { targetFieldId: 't1' })
      expect(second.created).toBeNull()
      expect(second.list).toHaveLength(1)
    })

    it('hasCouplingForTarget reflects both source-bound and source-less couplings', () => {
      expect(hasCouplingForTarget([], 't1')).toBe(false)
      const { list } = addDefaultValueCoupling([], { targetFieldId: 't1' })
      expect(hasCouplingForTarget(list, 't1')).toBe(true)
    })

    // Scenario: Removing a default-value coupling returns the target field to unmapped
    it('removeMapping deletes a source-less coupling just like a regular one', () => {
      const { list, created } = addDefaultValueCoupling([], { targetFieldId: 't1' })
      expect(removeMapping(list, created!.id)).toEqual([])
    })

    // A default value is resolved the same way any other mismatch is: a
    // transformation rule. addRule/removeRule need no special-casing for a
    // source-less coupling — removing the rule makes it unresolved again
    // exactly like it does for any other mismatch type.
    it('a default value is set and removed via the generic addRule/removeRule ops', () => {
      const { list, created } = addDefaultValueCoupling([], { targetFieldId: 't1' })
      const withValue = addRule([...list], created!.id, {
        expression: '"actief"',
        label: 'Standaardwaarde: actief',
        source: 'mismatch-solution',
        resolvesMismatch: 'missing-source',
      })
      expect(withValue[0]!.transformations).toHaveLength(1)
      expect(withValue[0]!.transformations[0]!.resolvesMismatch).toBe('missing-source')

      const ruleId = withValue[0]!.transformations[0]!.id
      const cleared = removeRule(withValue, created!.id, ruleId)
      expect(cleared[0]!.transformations).toHaveLength(0)
    })
  })

  // Feature #194: an alternative-storage coupling is the mirror image of a
  // source-less coupling — a source field with no target, resolved by a
  // transformation rule that names where the value goes instead (e.g. "PDF").
  describe('alternative-storage coupling', () => {
    function withName(sourceFieldId: string, name: string): FieldMapping[] {
      const { list, created } = addAlternativeStorageCoupling([], { sourceFieldId })
      return setAlternativeStorage(list, created!.id, sourceFieldId, name)
    }

    // Scenario: Confirming the dialogue creates an alternative-storage coupling
    it('addAlternativeStorageCoupling appends a coupling with a null targetFieldId', () => {
      const { list, created } = addAlternativeStorageCoupling([], {
        sourceFieldId: 'Bedrijf.notities.inhoud',
      })
      expect(created).not.toBeNull()
      expect(created!.sourceFieldId).toBe('Bedrijf.notities.inhoud')
      expect(created!.targetFieldId).toBeNull()
      expect(created!.transformations).toEqual([])
      expect(list).toHaveLength(1)
    })

    // Scenario: Double-clicking a source field that already has a coupling selects it
    it('rejects a source that already has a regular coupling', () => {
      const { list } = addMapping([], { sourceFieldId: 's1', targetFieldId: 't1' })
      const result = addAlternativeStorageCoupling(list, { sourceFieldId: 's1' })
      expect(result.created).toBeNull()
      expect(result.list).toBe(list)
    })

    it('rejects a source that already has an alternative-storage coupling', () => {
      const first = addAlternativeStorageCoupling([], { sourceFieldId: 's1' })
      const second = addAlternativeStorageCoupling(first.list, { sourceFieldId: 's1' })
      expect(second.created).toBeNull()
      expect(second.list).toHaveLength(1)
    })

    // Alternative storage and regular couplings exclude each other on one
    // source field; replacing one with the other is the canvas's decision.
    it('addMapping rejects a source that goes to alternative storage', () => {
      const { list } = addAlternativeStorageCoupling([], { sourceFieldId: 's1' })
      const result = addMapping(list, { sourceFieldId: 's1', targetFieldId: 't1' })
      expect(result.created).toBeNull()
      expect(result.list).toBe(list)
    })

    it('hasCouplingForSource reflects regular and alternative-storage couplings', () => {
      expect(hasCouplingForSource([], 's1')).toBe(false)
      const regular = addMapping([], { sourceFieldId: 's1', targetFieldId: 't1' }).list
      expect(hasCouplingForSource(regular, 's1')).toBe(true)
      const alt = addAlternativeStorageCoupling([], { sourceFieldId: 's2' }).list
      expect(hasCouplingForSource(alt, 's2')).toBe(true)
      expect(hasCouplingForSource(alt, 's1')).toBe(false)
    })

    // Scenario: Removing an alternative-storage coupling returns the source field to unmapped
    it('removeMapping deletes an alternative-storage coupling just like a regular one', () => {
      const { list, created } = addAlternativeStorageCoupling([], { sourceFieldId: 's1' })
      const cleared = removeMapping(list, created!.id)
      expect(cleared).toEqual([])
      expect(hasCouplingForSource(cleared, 's1')).toBe(false)
    })

    it('setAlternativeStorage adds a rule that passes the source value through unchanged', () => {
      const [mapping] = withName('Bedrijf.notities.inhoud', 'PDF')
      expect(mapping!.transformations).toHaveLength(1)
      const rule = mapping!.transformations[0]!
      expect(rule.expression).toBe('Bedrijf.notities.inhoud')
      expect(rule.label).toBe('Alternatieve opslag: PDF')
      expect(rule.source).toBe('mismatch-solution')
      expect(rule.resolvesMismatch).toBe('missing-target')
      expect(rule.solutionParams).toEqual({ type: 'alternative-storage', name: 'PDF' })
      expect(alternativeStorageName(mapping!)).toBe('PDF')
    })

    // Invariant: a coupling holds at most one alternative-storage rule.
    it('setAlternativeStorage replaces an existing name instead of adding a second rule', () => {
      const list = withName('s1', 'PDF')
      const renamed = setAlternativeStorage(list, list[0]!.id, 's1', 'Archief')
      expect(renamed[0]!.transformations).toHaveLength(1)
      expect(alternativeStorageName(renamed[0]!)).toBe('Archief')
    })

    it('setAlternativeStorage keeps unrelated rules on the coupling', () => {
      const { list, created } = addAlternativeStorageCoupling([], { sourceFieldId: 's1' })
      const withManual = addRule(list, created!.id, {
        expression: '$substring(s1, 0, 10)',
        label: 'Inkorten',
        source: 'manual',
      })
      const named = setAlternativeStorage(withManual, created!.id, 's1', 'PDF')
      expect(named[0]!.transformations.map((r) => r.label)).toEqual([
        'Inkorten',
        'Alternatieve opslag: PDF',
      ])
    })

    // Scenario: Spaces around a name are ignored
    it('setAlternativeStorage trims the name', () => {
      const [mapping] = withName('s1', '  PDF ')
      expect(alternativeStorageName(mapping!)).toBe('PDF')
    })

    it('setAlternativeStorage ignores a blank name and an unknown mapping id', () => {
      const { list, created } = addAlternativeStorageCoupling([], { sourceFieldId: 's1' })
      expect(setAlternativeStorage(list, created!.id, 's1', '   ')).toBe(list)
      expect(setAlternativeStorage(list, 'nope', 's1', 'PDF')).toBe(list)
    })

    // Scenario: Removing the name returns the coupling to unresolved
    it('removing the alternative-storage rule leaves the coupling without a name', () => {
      const list = withName('s1', 'PDF')
      const ruleId = list[0]!.transformations[0]!.id
      const cleared = removeRule(list, list[0]!.id, ruleId)
      expect(alternativeStorageName(cleared[0]!)).toBeUndefined()
      expect(cleared[0]!.targetFieldId).toBeNull()
    })

    describe('usedAlternativeStorageNames', () => {
      // Scenario: Several names in use are offered as suggestions
      it('returns the distinct names in use, sorted', () => {
        const list = [
          ...withName('s1', 'PDF'),
          ...withName('s2', 'Archief'),
          ...withName('s3', 'PDF'),
        ]
        expect(usedAlternativeStorageNames(list)).toEqual(['Archief', 'PDF'])
      })

      it('leaves out the coupling being edited and couplings without a name', () => {
        const named = withName('s1', 'PDF')
        const unnamed = addAlternativeStorageCoupling(named, { sourceFieldId: 's2' })
        expect(usedAlternativeStorageNames(unnamed.list, unnamed.created!.id)).toEqual(['PDF'])
        expect(usedAlternativeStorageNames(named, named[0]!.id)).toEqual([])
      })

      // Scenario: A name stops being suggested once no coupling uses it
      it('no longer returns a name once no coupling uses it', () => {
        const list = withName('s1', 'Archief')
        const cleared = removeRule(list, list[0]!.id, list[0]!.transformations[0]!.id)
        expect(usedAlternativeStorageNames(cleared)).toEqual([])
      })
    })

    describe('findCasingVariant', () => {
      // Scenario Outline: A name that differs only in casing from a name in use triggers a warning
      it.each([
        ['PDF', 'pdf'],
        ['PDF', 'Pdf'],
        ['Archief', 'ARCHIEF'],
      ])('suggests "%s" when "%s" is entered', (inUse, entered) => {
        expect(findCasingVariant(entered, [inUse])).toBe(inUse)
      })

      // Scenario Outline: A name that matches exactly or is genuinely new triggers no warning
      it.each(['PDF', 'Archief', ' PDF '])('gives no warning for "%s"', (entered) => {
        expect(findCasingVariant(entered, ['PDF'])).toBeUndefined()
      })
    })

    describe('restoreMappings', () => {
      const schema = buildSchema('s', [
        { id: 'a', name: 'a', path: 'a', dataType: 'string', required: false },
      ])

      // Scenario: Importing a koppelingsset restores alternative-storage couplings and their names
      it('rebuilds the alternative-storage rule from the exported name', () => {
        const exported: ExportedFieldMapping[] = [
          { sourceField: 'a', targetField: null, alternativeStorage: 'PDF', transformations: [] },
        ]
        const [restored] = restoreMappings(exported, schema, schema)
        expect(restored!.targetFieldId).toBeNull()
        expect(restored!.orphaned).toBeUndefined()
        expect(alternativeStorageName(restored!)).toBe('PDF')
        expect(restored!.transformations[0]!.resolvesMismatch).toBe('missing-target')
        expect(restored!.transformations[0]!.expression).toBe('a')
      })

      it('restores an unnamed alternative-storage coupling without a rule', () => {
        const exported: ExportedFieldMapping[] = [
          { sourceField: 'a', targetField: null, transformations: [] },
        ]
        const [restored] = restoreMappings(exported, schema, schema)
        expect(restored!.targetFieldId).toBeNull()
        expect(restored!.transformations).toEqual([])
        expect(restored!.orphaned).toBeUndefined()
      })

      it('flags an alternative-storage coupling as orphaned if its source path is gone', () => {
        const exported: ExportedFieldMapping[] = [
          {
            sourceField: 'missing',
            targetField: null,
            alternativeStorage: 'PDF',
            transformations: [],
          },
        ]
        expect(restoreMappings(exported, schema, schema)[0]!.orphaned).toBe(true)
      })

      // Invariant: never both null — a hand-edited file is kept but surfaced as orphaned.
      it('flags a coupling with neither a source nor a target as orphaned', () => {
        const exported: ExportedFieldMapping[] = [
          { sourceField: null, targetField: null, transformations: [] },
        ]
        expect(restoreMappings(exported, schema, schema)[0]!.orphaned).toBe(true)
      })
    })
  })
})
