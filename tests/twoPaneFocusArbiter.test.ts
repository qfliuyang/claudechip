import { describe, expect, test } from 'bun:test';
import {
  createTwoPaneFocusState,
  onTabFromLeft,
  onTabFromRight,
  withRightPaneVisibility,
} from '../src/layout/TwoPaneFocusArbiter.js';

describe('TwoPaneFocusArbiter', () => {
  test('starts left-focused when right pane hidden', () => {
    const state = createTwoPaneFocusState(false, 'right');
    expect(state.owner).toBe('left');
  });

  test('tab from left focuses right when right pane is visible', () => {
    const start = createTwoPaneFocusState(true, 'left');
    const next = onTabFromLeft(start);
    expect(next.owner).toBe('right');
  });

  test('tab from right returns focus to left', () => {
    const start = createTwoPaneFocusState(true, 'right');
    const next = onTabFromRight(start);
    expect(next.owner).toBe('left');
  });

  test('hiding right pane forces focus back to left', () => {
    const start = createTwoPaneFocusState(true, 'right');
    const next = withRightPaneVisibility(start, false);
    expect(next.owner).toBe('left');
    expect(next.rightPaneVisible).toBe(false);
  });
});

