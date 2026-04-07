import { describe, expect, test } from 'bun:test'
import { TerminalSurface } from '../src/terminal/TerminalSurface.js'

describe('TerminalSurface', () => {
  test('carriage return overwrites current line like a terminal', async () => {
    const surface = new TerminalSurface(20, 5)
    await surface.write('hello\rj')

    expect(surface.getLines().join('\n')).toContain('jello')
  })

  test('newline starts the next line at column zero for normal shell interaction', async () => {
    const surface = new TerminalSurface(20, 5)
    await surface.write('abc\nx')

    expect(surface.getLines()[0]).toBe('abc')
    expect(surface.getLines()[1]).toBe('x')
  })

  test('clear line sequence removes trailing content', async () => {
    const surface = new TerminalSurface(20, 5)
    await surface.write('hello world\r\x1b[5C\x1b[K')

    expect(surface.getLines()[0]).toBe('hello')
  })

  test('cursor movement updates visible content', async () => {
    const surface = new TerminalSurface(20, 5)
    await surface.write('abcde\x1b[2DXY')

    expect(surface.getLines()[0]).toBe('abcXY')
  })

  test('alternate screen is isolated and restores the main screen', async () => {
    const surface = new TerminalSurface(20, 5)
    await surface.write('main screen')
    await surface.write('\x1b[?1049h')
    await surface.write('alt view')

    expect(surface.isUsingAltBuffer()).toBe(true)
    expect(surface.getLines().join('\n')).toContain('alt view')

    await surface.write('\x1b[?1049l')

    expect(surface.isUsingAltBuffer()).toBe(false)
    expect(surface.getLines().join('\n')).toContain('main screen')
  })

  test('styled cells are exposed as render segments', async () => {
    const surface = new TerminalSurface(20, 5)
    await surface.write('\x1b[31mred\x1b[0m plain \x1b[4;44munder\x1b[0m')

    const row = surface.getRows()[0]
    expect(row?.segments[0]).toEqual({
      text: 'red',
      style: {
        color: 'ansi256(1)',
      },
    })
    expect(row?.segments[1]).toEqual({
      text: ' plain ',
      style: {},
    })
    expect(row?.segments[2]).toEqual({
      text: 'under',
      style: {
        backgroundColor: 'ansi256(4)',
        underline: true,
      },
    })
  })

  test('cursor is rendered on the active cell when requested', async () => {
    const surface = new TerminalSurface(20, 5)
    await surface.write('ab')

    const row = surface.getRows({ showCursor: true })[0]
    expect(row?.segments).toEqual([
      {
        text: 'ab',
        style: {
          color: undefined,
          backgroundColor: undefined,
          bold: undefined,
          dim: undefined,
          italic: undefined,
          underline: undefined,
          strikethrough: undefined,
          inverse: undefined,
        },
      },
      {
        text: '█',
        style: {
          color: 'ansi:greenBright',
          backgroundColor: undefined,
          bold: undefined,
          dim: undefined,
          italic: undefined,
          underline: undefined,
          strikethrough: undefined,
          inverse: undefined,
        },
      },
    ])
  })

  test('ansi lines render styled terminal rows as full-width strings', async () => {
    const surface = new TerminalSurface(8, 4)
    await surface.write('\x1b[31mred\x1b[0m')

    const line = surface.getAnsiLines()[0]
    expect(line).toContain('\x1b[0;38;5;1mred')
    expect(line.endsWith('\x1b[0m     ')).toBe(true)
  })
})
