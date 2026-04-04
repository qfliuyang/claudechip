import type { TwoPaneGeometry } from './TwoPaneContracts.js';

export interface TwoPaneGeometryInput {
  columns: number;
  rows: number;
  showRightPane: boolean;
  rightPaneWidthPercent: number;
  minTwoPaneColumns: number;
  minPaneCols: number;
  dividerCols: number;
}

export type TwoPaneGeometryResult = TwoPaneGeometry;

export function computeTwoPaneGeometry(input: TwoPaneGeometryInput): TwoPaneGeometryResult {
  const {
    columns,
    rows,
    showRightPane,
    rightPaneWidthPercent,
    minTwoPaneColumns,
    minPaneCols,
    dividerCols,
  } = input;

  if (!showRightPane || columns < minTwoPaneColumns) {
    return {
      mode: 'single',
      rows,
      leftCols: columns,
      rightCols: 0,
      dividerCols: 0,
    };
  }

  const desiredRightCols = Math.floor(columns * (rightPaneWidthPercent / 100));
  const maxRightCols = columns - minPaneCols - dividerCols;
  const rightCols = Math.max(minPaneCols, Math.min(desiredRightCols, maxRightCols));

  let leftCols = columns - rightCols - dividerCols;
  if (leftCols < minPaneCols) {
    leftCols = minPaneCols;
  }

  const remainingCols = columns - leftCols - dividerCols;
  if (remainingCols < minPaneCols) {
    return {
      mode: 'single',
      rows,
      leftCols: columns,
      rightCols: 0,
      dividerCols: 0,
    };
  }

  if (leftCols + dividerCols + rightCols > columns) {
    return {
      mode: 'single',
      rows,
      leftCols: columns,
      rightCols: 0,
      dividerCols: 0,
    };
  }

  return {
    mode: 'split',
    rows,
    leftCols,
    rightCols,
    dividerCols,
  };
}
