export type TwoPaneMode = 'single' | 'split';

export interface TwoPaneGeometry {
  mode: TwoPaneMode;
  rows: number;
  leftCols: number;
  rightCols: number;
  dividerCols: number;
}

/**
 * Render-surface contract for the V2 compositor path.
 * Each pane provides rows in local pane coordinates only.
 */
export interface PaneSurfaceFrame {
  cols: number;
  rows: number;
  lines: string[];
}

export interface PaneLocalSize {
  cols: number;
  rows: number;
}

export interface PaneSurfaceRenderer {
  renderLeft(size: PaneLocalSize): PaneSurfaceFrame;
  renderRight(size: PaneLocalSize): PaneSurfaceFrame;
}

export interface ComposeTwoPaneFrameInput {
  columns: number;
  rows: number;
  mode: TwoPaneMode;
  left: PaneSurfaceFrame;
  right?: PaneSurfaceFrame;
  divider: string;
}

function normalizeRow(text: string, width: number): string {
  if (width <= 0) return '';
  if (text.length === width) return text;
  if (text.length > width) return text.slice(0, width);
  return text + ' '.repeat(width - text.length);
}

function readLine(lines: string[], row: number): string {
  return row >= 0 && row < lines.length ? lines[row] ?? '' : '';
}

/**
 * Pure row-wise compositor for fence-style rendering:
 * left row + divider + right row, clipped/padded to exact frame width.
 */
export function composeTwoPaneFrame(input: ComposeTwoPaneFrameInput): string[] {
  const { columns, rows, mode, left, right, divider } = input;
  const out: string[] = [];

  for (let row = 0; row < rows; row++) {
    const leftRow = normalizeRow(readLine(left.lines, row), left.cols);
    if (mode === 'single' || !right) {
      out.push(normalizeRow(leftRow, columns));
      continue;
    }

    const dividerRow = normalizeRow(divider, 1);
    const rightRow = normalizeRow(readLine(right.lines, row), right.cols);
    out.push(normalizeRow(leftRow + dividerRow + rightRow, columns));
  }

  return out;
}
