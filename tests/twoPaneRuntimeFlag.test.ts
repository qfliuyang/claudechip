import { describe, expect, test } from 'bun:test';
import { isTwoPaneRuntimeV2Enabled } from '../src/layout/twoPaneRuntimeFlag.js';

describe('twoPaneRuntimeFlag', () => {
  test('defaults to enabled when env var is missing', () => {
    expect(isTwoPaneRuntimeV2Enabled({})).toBe(true);
  });

  test('disables when explicit falsy env is set', () => {
    expect(isTwoPaneRuntimeV2Enabled({ CLAUDECHIP_TWO_PANE_V2: '0' })).toBe(false);
    expect(isTwoPaneRuntimeV2Enabled({ CLAUDECHIP_TWO_PANE_V2: 'false' })).toBe(false);
    expect(isTwoPaneRuntimeV2Enabled({ CLAUDECHIP_TWO_PANE_V2: 'off' })).toBe(false);
  });

  test('enables when explicit truthy env is set', () => {
    expect(isTwoPaneRuntimeV2Enabled({ CLAUDECHIP_TWO_PANE_V2: '1' })).toBe(true);
    expect(isTwoPaneRuntimeV2Enabled({ CLAUDECHIP_TWO_PANE_V2: 'true' })).toBe(true);
  });
});
