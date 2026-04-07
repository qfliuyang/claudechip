let terminalPanelFocused = false
let terminalPanelFocusRequested = false

export function setTerminalPanelFocused(focused: boolean): void {
  terminalPanelFocused = focused
}

export function isTerminalPanelFocused(): boolean {
  return terminalPanelFocused
}

export function requestTerminalPanelFocus(): void {
  terminalPanelFocusRequested = true
}

export function consumeTerminalPanelFocusRequest(): boolean {
  const requested = terminalPanelFocusRequested
  terminalPanelFocusRequested = false
  return requested
}
