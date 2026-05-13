import { describe, it, expect } from 'vitest'
import type { TransformationRule, MismatchType, RuleSource, SolutionParams } from '../mapping'

describe('TransformationRule', () => {
  it('carries expression, label, and source', () => {
    const rule: TransformationRule = {
      id: 'rule-1',
      expression: '$string($)',
      label: 'Naar tekst',
      source: 'manual' satisfies RuleSource,
    }

    expect(rule.id).toBe('rule-1')
    expect(rule.expression).toBe('$string($)')
    expect(rule.label).toBe('Naar tekst')
    expect(rule.source).toBe('manual')
  })

  it('records which mismatch it resolves and retains solutionParams', () => {
    const params: SolutionParams = { type: 'truncate', maxLength: 50 }
    const rule: TransformationRule = {
      id: 'rule-2',
      expression: '$length($) > 50 ? $substring($, 0, 47) & "..." : $',
      label: 'Afkappen op 50 tekens',
      source: 'mismatch-solution',
      resolvesMismatch: 'truncate' satisfies MismatchType,
      solutionParams: params,
    }

    expect(rule.resolvesMismatch).toBe('truncate')
    expect(rule.solutionParams).toEqual({ type: 'truncate', maxLength: 50 })
  })

  it('stores aiExplanation for AI-generated rules', () => {
    const rule: TransformationRule = {
      id: 'rule-3',
      expression: '$string($)',
      label: 'AI: naar tekst',
      source: 'ai',
      aiExplanation: 'Converts number to string',
    }

    expect(rule.source).toBe('ai')
    expect(rule.aiExplanation!.length).toBeLessThanOrEqual(100)
  })
})
