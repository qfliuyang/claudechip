import { describe, expect, test } from 'bun:test'
import { getTerminalPanelAction } from '../src/components/terminal/TerminalPanel.js'
import { classifyTerminalRequest } from '../src/commands/terminal-mode/shared.js'
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

  test('classifies plain terminal tasks separately from literal commands', () => {
    expect(classifyTerminalRequest('pkill -f dc_shell', 'shell')).toBe('literal')
    expect(
      classifyTerminalRequest('kill all process with name "dc_shell"', 'shell'),
    ).toBe('natural_language')
  })

  test('uses per-mode command lookup hints', () => {
    expect(
      classifyTerminalRequest('report_timing -from CLK -to U1/Q', 'innovus'),
    ).toBe('literal')
    expect(
      classifyTerminalRequest('debug the clock tree latency problem', 'innovus'),
    ).toBe('natural_language')

    expect(
      classifyTerminalRequest('report_qor', 'icc2_shell'),
    ).toBe('literal')
    expect(
      classifyTerminalRequest('find the worst setup path', 'pt_shell'),
    ).toBe('natural_language')

    expect(classifyTerminalRequest(':wq', 'vim')).toBe('literal')
    expect(classifyTerminalRequest('how do i quit vim', 'vim')).toBe(
      'natural_language',
    )
  })
})
