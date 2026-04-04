import { expect, test } from 'bun:test';
import {
  NdjsonStreamParser,
  encodeNdjsonMessage,
} from '../src/terminal/TerminalProtocol.ts';

test('NDJSON parser handles fragmented message chunks', () => {
  const parser = new NdjsonStreamParser<{ type: string; value: number }>();
  const firstHalf = '{"type":"output","value":1';
  const secondHalf = '}\n';

  const step1 = parser.push(firstHalf);
  expect(step1.messages.length).toBe(0);
  expect(step1.errors.length).toBe(0);

  const step2 = parser.push(secondHalf);
  expect(step2.errors.length).toBe(0);
  expect(step2.messages).toEqual([{ type: 'output', value: 1 }]);
});

test('NDJSON parser handles multiple messages in one chunk', () => {
  const parser = new NdjsonStreamParser<{ id: number }>();
  const chunk = `${encodeNdjsonMessage({ id: 1 })}${encodeNdjsonMessage({ id: 2 })}`;
  const parsed = parser.push(chunk);
  expect(parsed.errors.length).toBe(0);
  expect(parsed.messages).toEqual([{ id: 1 }, { id: 2 }]);
});

test('NDJSON parser reports malformed message and continues', () => {
  const parser = new NdjsonStreamParser<{ ok: boolean }>();
  const chunk = `{"ok":true}\nnot-json\n{"ok":false}\n`;
  const parsed = parser.push(chunk);

  expect(parsed.messages).toEqual([{ ok: true }, { ok: false }]);
  expect(parsed.errors.length).toBe(1);
  expect(parsed.errors[0]).toBe('not-json');
});

