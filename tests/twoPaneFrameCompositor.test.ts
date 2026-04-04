import { describe, expect, test } from 'bun:test';
import { composeTwoPaneFrame } from '../src/layout/TwoPaneContracts.js';

describe('TwoPaneFrameCompositor', () => {
  test('composes split rows with strict total width', () => {
    const rows = composeTwoPaneFrame({
      columns: 10,
      rows: 2,
      mode: 'split',
      divider: '|',
      left: { cols: 4, rows: 2, lines: ['abcd', 'xy'] },
      right: { cols: 5, rows: 2, lines: ['12345', 'z'] },
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toBe('abcd|12345');
    expect(rows[1]).toBe('xy  |z    ');
    expect(rows[0]?.length).toBe(10);
    expect(rows[1]?.length).toBe(10);
  });

  test('clips overlong pane rows before composition', () => {
    const rows = composeTwoPaneFrame({
      columns: 8,
      rows: 1,
      mode: 'split',
      divider: '|',
      left: { cols: 3, rows: 1, lines: ['LEFT-TOO-LONG'] },
      right: { cols: 4, rows: 1, lines: ['RIGHT-TOO-LONG'] },
    });

    expect(rows[0]).toBe('LEF|RIGH');
    expect(rows[0]?.length).toBe(8);
  });

  test('single mode only renders left fence content', () => {
    const rows = composeTwoPaneFrame({
      columns: 6,
      rows: 2,
      mode: 'single',
      divider: '|',
      left: { cols: 6, rows: 2, lines: ['abc', '123456789'] },
      right: { cols: 0, rows: 0, lines: [] },
    });

    expect(rows).toEqual(['abc   ', '123456']);
  });
});

