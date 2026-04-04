/**
 * Tests for TwoPaneRuntimeV2 pure helper functions.
 *
 * The component itself uses hooks (useState, useInput) so can't be called as a
 * plain function. Instead, we test the exported pure helpers (formatCost,
 * abbreviateCwd) and rely on the existing tests for the underlying logic:
 *   - paneGeometryController.test.ts — tests computeTwoPaneGeometry
 *   - twoPaneFocusArbiter.test.ts — tests onCtrlBToggle and focus state
 *
 * For full integration testing of the rendered TUI, run the app manually.
 */
import { describe, expect, test } from 'bun:test'
import { formatCost, abbreviateCwd } from '../src/components/TwoPaneRuntimeV2.js'

describe('TwoPaneRuntimeV2 helpers', () => {
  describe('formatCost', () => {
    test('formats cost under $0.01 as <$0.01', () => {
      expect(formatCost(0.005)).toBe('<$0.01')
      expect(formatCost(0)).toBe('<$0.01')
    })

    test('formats cost >= $0.01 with 2 decimals', () => {
      expect(formatCost(0.05)).toBe('$0.05')
      expect(formatCost(1.234)).toBe('$1.23')
      expect(formatCost(10.5)).toBe('$10.50')
    })
  })

  describe('abbreviateCwd', () => {
    const originalHome = process.env.HOME

    test('replaces HOME with ~ when cwd starts with HOME', () => {
      process.env.HOME = '/Users/testuser'
      expect(abbreviateCwd('/Users/testuser/projects/foo')).toBe('~/projects/foo')
      process.env.HOME = originalHome
    })

    test('keeps full path when not under HOME', () => {
      process.env.HOME = '/Users/testuser'
      expect(abbreviateCwd('/opt/project')).toBe('/opt/project')
      process.env.HOME = originalHome
    })

    test('abbreviates deep paths to last 2 segments', () => {
      process.env.HOME = '/Users/testuser'
      expect(abbreviateCwd('/Users/testuser/a/b/c/d')).toBe('…/c/d')
      process.env.HOME = originalHome
    })

    test('keeps short paths unchanged', () => {
      process.env.HOME = '/Users/testuser'
      expect(abbreviateCwd('/Users/testuser/a')).toBe('~/a')
      expect(abbreviateCwd('/Users/testuser/a/b')).toBe('~/a/b')
      process.env.HOME = originalHome
    })
  })
})
