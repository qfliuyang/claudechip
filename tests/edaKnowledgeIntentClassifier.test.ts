import { describe, expect, test } from 'bun:test'
import { classifyEdaIntent } from '../src/eda-kb/IntentClassifier.js'

describe('classifyEdaIntent', () => {
  test('classifies explicit command lookup with high confidence', () => {
    const result = classifyEdaIntent('report_timing -path_type full_clock')

    expect(result.primary).toBe('command_lookup')
    expect(result.confidence).toBeGreaterThanOrEqual(0.85)
    expect(result.strategy).toBe('rule-only')
  })

  test('classifies debugging prompt as troubleshooting', () => {
    const result = classifyEdaIntent('how to debug clock tree latency problem')

    expect(result.primary).toBe('troubleshooting')
    expect(result.secondary).toContain('how_to')
  })

  test('classifies script generation request as script synthesis', () => {
    const result = classifyEdaIntent('generate a small script for worst hold path inspection')

    expect(result.primary).toBe('script_synthesis')
    expect(result.strategy).toBe('rule-only')
  })
})
