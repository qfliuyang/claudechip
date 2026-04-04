import { describe, expect, test } from 'bun:test';
import { computeTwoPaneGeometry } from '../src/layout/PaneGeometryController.js';

describe('PaneGeometryController', () => {
  test('returns single mode when right pane hidden', () => {
    const out = computeTwoPaneGeometry({
      columns: 170,
      rows: 44,
      showRightPane: false,
      rightPaneWidthPercent: 35,
      minTwoPaneColumns: 100,
      minPaneCols: 32,
      dividerCols: 1,
    });

    expect(out.mode).toBe('single');
    expect(out.leftCols).toBe(170);
    expect(out.rightCols).toBe(0);
  });

  test('returns split mode with constrained pane widths', () => {
    const out = computeTwoPaneGeometry({
      columns: 170,
      rows: 44,
      showRightPane: true,
      rightPaneWidthPercent: 35,
      minTwoPaneColumns: 100,
      minPaneCols: 32,
      dividerCols: 1,
    });

    expect(out.mode).toBe('split');
    expect(out.leftCols + out.dividerCols + out.rightCols).toBe(170);
    expect(out.leftCols).toBeGreaterThanOrEqual(32);
    expect(out.rightCols).toBeGreaterThanOrEqual(32);
  });

  test('falls back to single mode when constraints cannot be satisfied', () => {
    const out = computeTwoPaneGeometry({
      columns: 80,
      rows: 24,
      showRightPane: true,
      rightPaneWidthPercent: 35,
      minTwoPaneColumns: 100,
      minPaneCols: 32,
      dividerCols: 1,
    });

    expect(out.mode).toBe('single');
    expect(out.rightCols).toBe(0);
  });

  test('collapses even above min width when both panes cannot satisfy min cols', () => {
    const out = computeTwoPaneGeometry({
      columns: 64,
      rows: 24,
      showRightPane: true,
      rightPaneWidthPercent: 35,
      minTwoPaneColumns: 60,
      minPaneCols: 32,
      dividerCols: 1,
    });

    expect(out.mode).toBe('single');
    expect(out.leftCols).toBe(64);
    expect(out.rightCols).toBe(0);
  });
});
