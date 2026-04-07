import { describe, expect, test } from 'bun:test'
import { getTerminalPanelAction } from '../src/components/terminal/TerminalPanel.js'
import type { Key } from '../src/ink/events/input-event.js'

function makeKey(overrides: Partial<Key> = {}): Key {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    wheelUp: false,
    wheelDown: false,
    home: false,
    end: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    fn: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    super: false,
    ...overrides,
  }
}

describe('terminal panel human control mapping', () => {
  test('maps ctrl+b to pane blur', () => {
    expect(getTerminalPanelAction('b', makeKey({ ctrl: true }))).toEqual({
      type: 'blur',
    })
  })

  test('maps terminal navigation keys to control sequences', () => {
    expect(getTerminalPanelAction('', makeKey({ upArrow: true }))).toEqual({
      type: 'write',
      data: '\x1b[A',
    })
    expect(getTerminalPanelAction('', makeKey({ rightArrow: true }))).toEqual({
      type: 'write',
      data: '\x1b[C',
    })
    expect(getTerminalPanelAction('', makeKey({ backspace: true }))).toEqual({
      type: 'write',
      data: '\x7f',
    })
  })

  test('maps interrupt and suspend controls explicitly', () => {
    expect(getTerminalPanelAction('c', makeKey({ ctrl: true }))).toEqual({
      type: 'signal',
      kind: 'sigint',
    })
    expect(getTerminalPanelAction('z', makeKey({ ctrl: true }))).toEqual({
      type: 'signal',
      kind: 'sigstop',
    })
  })

  test('passes printable input through to the shared terminal session', () => {
    expect(getTerminalPanelAction('ls -la', makeKey())).toEqual({
      type: 'write',
      data: 'ls -la',
    })
  })
})
