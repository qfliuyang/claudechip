import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

let mockColumns = 160
const mockRows = 40

mock.module('../src/hooks/useTerminalSize.js', () => ({
  useTerminalSize: () => ({ columns: mockColumns, rows: mockRows }),
}))

const { TwoPaneLayout } = await import('../src/components/TwoPaneLayout.js')

afterEach(() => {
  mockColumns = 160
})

function findByTestId(node: unknown, testId: string): any | null {
  if (!node || typeof node !== 'object') return null
  const typed = node as { props?: Record<string, unknown> }
  if (typed.props?.['data-testid'] === testId) return typed

  const children = typed.props?.children
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findByTestId(child, testId)
      if (found) return found
    }
    return null
  }
  return findByTestId(children, testId)
}

function renderLayout(props: {
  showRightPane: boolean
  rightPaneWidth?: number
  keepMountedRightPane?: boolean
}): ReactNode {
  return TwoPaneLayout({
    leftPane: 'LEFT',
    rightPane: 'RIGHT',
    showRightPane: props.showRightPane,
    rightPaneWidth: props.rightPaneWidth,
    keepMountedRightPane: props.keepMountedRightPane,
  })
}

describe('TwoPaneLayout', () => {
  test('renders split layout with expected default widths', () => {
    mockColumns = 160
    const tree = renderLayout({ showRightPane: true })

    const root = findByTestId(tree, 'two-pane-layout')
    const left = findByTestId(tree, 'left-pane')
    const right = findByTestId(tree, 'right-pane')
    const divider = findByTestId(tree, 'pane-divider')

    expect(root).not.toBeNull()
    expect(left).not.toBeNull()
    expect(right).not.toBeNull()
    expect(divider).not.toBeNull()

    // default rightPaneWidth = 50%
    expect(right.props.width).toBe(80)
    expect(left.props.width).toBe(79)
    expect(divider.props.width).toBe(1)
  })

  test('collapses to single pane when terminal is too narrow', () => {
    mockColumns = 99
    const tree = renderLayout({ showRightPane: true })

    expect(findByTestId(tree, 'two-pane-layout')).not.toBeNull()
    expect(findByTestId(tree, 'left-pane')).toBeNull()
    expect(findByTestId(tree, 'right-pane')).toBeNull()
  })

  test('keeps right pane mounted-but-hidden when requested', () => {
    mockColumns = 160
    const tree = renderLayout({
      showRightPane: false,
      keepMountedRightPane: true,
    })

    const hiddenRight = findByTestId(tree, 'right-pane-hidden')
    expect(hiddenRight).not.toBeNull()
    expect(hiddenRight.props.width).toBe(0)
    expect(hiddenRight.props.height).toBe(0)
  })

  test('enforces minimum pane widths under aggressive right-pane ratio', () => {
    mockColumns = 100
    const tree = renderLayout({
      showRightPane: true,
      rightPaneWidth: 80,
    })

    const left = findByTestId(tree, 'left-pane')
    const right = findByTestId(tree, 'right-pane')

    expect(left).not.toBeNull()
    expect(right).not.toBeNull()
    expect(left.props.width).toBeGreaterThanOrEqual(32)
    expect(right.props.width).toBeGreaterThanOrEqual(32)
    expect(left.props.width + right.props.width + 1).toBe(100)
  })
})
