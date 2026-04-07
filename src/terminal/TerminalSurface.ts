import xtermHeadless from '@xterm/headless'
import type { Color } from '../ink/styles.js'
import { stringWidth } from '../ink/stringWidth.js'

type HeadlessTerminal = import('@xterm/headless').Terminal
type BufferCell = NonNullable<ReturnType<import('@xterm/headless').IBuffer['getNullCell']>>

const DEFAULT_SCROLLBACK_LINES = 2000

const { Terminal: XtermHeadlessTerminal } = xtermHeadless as {
  Terminal: new (options?: {
    cols?: number
    rows?: number
    scrollback?: number
    allowProposedApi?: boolean
    convertEol?: boolean
  }) => HeadlessTerminal
}

export type TerminalSegmentStyle = {
  color?: Color
  backgroundColor?: Color
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  inverse?: boolean
}

export type TerminalRenderSegment = {
  text: string
  style: TerminalSegmentStyle
}

export type TerminalRenderRow = {
  key: string
  segments: TerminalRenderSegment[]
}

function paletteColor(index: number): Color {
  return `ansi256(${index})`
}

function rgbColor(value: number): Color {
  const red = (value >> 16) & 0xff
  const green = (value >> 8) & 0xff
  const blue = value & 0xff
  return `rgb(${red},${green},${blue})`
}

function resolveFg(cell: BufferCell): Color | undefined {
  if (cell.isFgDefault()) return undefined
  if (cell.isFgRGB()) return rgbColor(cell.getFgColor())
  if (cell.isFgPalette()) return paletteColor(cell.getFgColor())
  return undefined
}

function resolveBg(cell: BufferCell): Color | undefined {
  if (cell.isBgDefault()) return undefined
  if (cell.isBgRGB()) return rgbColor(cell.getBgColor())
  if (cell.isBgPalette()) return paletteColor(cell.getBgColor())
  return undefined
}

function styleEquals(a: TerminalSegmentStyle, b: TerminalSegmentStyle): boolean {
  return (
    a.color === b.color &&
    a.backgroundColor === b.backgroundColor &&
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strikethrough === b.strikethrough &&
    a.inverse === b.inverse
  )
}

function isVisuallyEmptySegment(segment: TerminalRenderSegment): boolean {
  return (
    segment.text.trim() === '' &&
    segment.style.color === undefined &&
    segment.style.backgroundColor === undefined &&
    segment.style.bold !== true &&
    segment.style.dim !== true &&
    segment.style.italic !== true &&
    segment.style.underline !== true &&
    segment.style.strikethrough !== true &&
    segment.style.inverse !== true
  )
}

function isBlankCellText(text: string): boolean {
  return text.trim() === ''
}

function colorToSgr(color: Color, isBackground: boolean): string[] {
  if (color.startsWith('ansi:')) {
    const name = color.slice('ansi:'.length)
    const table: Record<string, number> = {
      black: 0,
      red: 1,
      green: 2,
      yellow: 3,
      blue: 4,
      magenta: 5,
      cyan: 6,
      white: 7,
      blackBright: 8,
      redBright: 9,
      greenBright: 10,
      yellowBright: 11,
      blueBright: 12,
      magentaBright: 13,
      cyanBright: 14,
      whiteBright: 15,
    }
    const value = table[name]
    if (value === undefined) return []
    if (value < 8) return [String((isBackground ? 40 : 30) + value)]
    return [String((isBackground ? 100 : 90) + (value - 8))]
  }

  if (color.startsWith('ansi256(') && color.endsWith(')')) {
    const value = Number(color.slice('ansi256('.length, -1))
    if (Number.isFinite(value)) {
      return [isBackground ? '48' : '38', '5', String(value)]
    }
    return []
  }

  if (color.startsWith('rgb(') && color.endsWith(')')) {
    const [red, green, blue] = color
      .slice('rgb('.length, -1)
      .split(',')
      .map(part => Number(part))
    if ([red, green, blue].every(Number.isFinite)) {
      return [isBackground ? '48' : '38', '2', String(red), String(green), String(blue)]
    }
  }

  return []
}

function styleToAnsi(style: TerminalSegmentStyle): string {
  const codes: string[] = ['0']
  if (style.bold) codes.push('1')
  if (style.dim) codes.push('2')
  if (style.italic) codes.push('3')
  if (style.underline) codes.push('4')
  if (style.inverse) codes.push('7')
  if (style.strikethrough) codes.push('9')
  if (style.color) codes.push(...colorToSgr(style.color, false))
  if (style.backgroundColor) codes.push(...colorToSgr(style.backgroundColor, true))
  return `\x1b[${codes.join(';')}m`
}

export class TerminalSurface {
  private cols: number
  private rows: number
  private readonly scrollbackLimit: number
  private readonly terminal: HeadlessTerminal
  private writeQueue = Promise.resolve()

  constructor(
    cols: number,
    rows: number,
    opts?: { scrollbackLimit?: number },
  ) {
    this.cols = Math.max(1, cols)
    this.rows = Math.max(1, rows)
    this.scrollbackLimit = opts?.scrollbackLimit ?? DEFAULT_SCROLLBACK_LINES
    this.terminal = new XtermHeadlessTerminal({
      cols: this.cols,
      rows: this.rows,
      scrollback: this.scrollbackLimit,
      allowProposedApi: true,
      convertEol: true,
    })
  }

  resize(cols: number, rows: number): void {
    this.cols = Math.max(1, cols)
    this.rows = Math.max(1, rows)
    this.terminal.resize(this.cols, this.rows)
  }

  async write(chunk: string): Promise<void> {
    if (!chunk) return

    this.writeQueue = this.writeQueue.then(
      () =>
        new Promise<void>(resolve => {
          this.terminal.write(chunk, resolve)
        }),
    )

    await this.writeQueue
  }

  async writeBytes(chunk: Uint8Array): Promise<void> {
    if (chunk.byteLength === 0) return

    this.writeQueue = this.writeQueue.then(
      () =>
        new Promise<void>(resolve => {
          this.terminal.write(chunk, resolve)
        }),
    )

    await this.writeQueue
  }

  getRows(opts?: { showCursor?: boolean }): TerminalRenderRow[] {
    const buffer = this.terminal.buffer.active
    const rows: TerminalRenderRow[] = []
    const cell = buffer.getNullCell()
    const showCursor = opts?.showCursor === true
    const cursorRow = buffer.baseY + buffer.cursorY
    const cursorCol = Math.max(0, Math.min(this.cols - 1, buffer.cursorX))

    for (let rowIndex = 0; rowIndex < buffer.length; rowIndex++) {
      const line = buffer.getLine(rowIndex)
      if (!line) continue

      const segments: TerminalRenderSegment[] = []

      for (let col = 0; col < this.cols; col++) {
        const nextCell = line.getCell(col, cell)
        if (!nextCell) break

        const width = nextCell.getWidth()
        if (width === 0) {
          continue
        }

        const chars = nextCell.isInvisible() ? ' ' : nextCell.getChars() || ' '
        const style: TerminalSegmentStyle = {
          color: resolveFg(nextCell),
          backgroundColor: resolveBg(nextCell),
          bold: nextCell.isBold() ? true : undefined,
          dim: nextCell.isDim() ? true : undefined,
          italic: nextCell.isItalic() ? true : undefined,
          underline: nextCell.isUnderline() ? true : undefined,
          strikethrough: nextCell.isStrikethrough() ? true : undefined,
          inverse: nextCell.isInverse() ? true : undefined,
        }
        const isCursorCell = showCursor && rowIndex === cursorRow && col === cursorCol
        const displayText = isCursorCell && isBlankCellText(chars) ? '█' : chars
        if (isCursorCell) {
          style.color = isBlankCellText(chars) ? 'ansi:greenBright' : 'ansi:black'
          style.backgroundColor = isBlankCellText(chars) ? undefined : 'ansi:greenBright'
          style.inverse = undefined
        }

        const previous = segments.at(-1)
        if (previous && styleEquals(previous.style, style)) {
          previous.text += displayText
        } else {
          segments.push({ text: displayText, style })
        }
      }

      while (segments.length > 0 && isVisuallyEmptySegment(segments[segments.length - 1]!)) {
        segments.pop()
      }

      rows.push({
        key: `row-${rowIndex}`,
        segments: segments.length > 0 ? segments : [{ text: ' ', style: {} }],
      })
    }

    if (rows.length === 0) {
      return [{ key: 'row-empty', segments: [{ text: ' ', style: {} }] }]
    }

    return rows
  }

  getLines(): string[] {
    return this.getRows().map(row => {
      const text = row.segments.map(segment => segment.text).join('').replace(/\s+$/g, '')
      return text || ' '
    })
  }

  getAnsiLines(opts?: { showCursor?: boolean }): string[] {
    return this.getRows(opts).map(row => {
      const rendered = row.segments
        .map(segment => `${styleToAnsi(segment.style)}${segment.text}`)
        .join('')
      const visibleWidth = row.segments.reduce(
        (sum, segment) => sum + stringWidth(segment.text),
        0,
      )
      const padding = visibleWidth < this.cols ? ' '.repeat(this.cols - visibleWidth) : ''
      return `${rendered}\x1b[0m${padding}`
    })
  }

  isUsingAltBuffer(): boolean {
    return this.terminal.buffer.active.type === 'alternate'
  }
}
