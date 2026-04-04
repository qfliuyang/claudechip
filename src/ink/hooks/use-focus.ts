import { useState, useEffect } from 'react';

/**
 * Stub useFocus hook for compatibility.
 * Returns isFocused: false until properly implemented.
 */
export function useFocus({ autoFocus = false }: { autoFocus?: boolean } = {}): { isFocused: boolean } {
  const [isFocused, setIsFocused] = useState(autoFocus);

  useEffect(() => {
    // Stub implementation - focus tracking not yet implemented
    // This hook is used by TerminalPanel and other components
  }, []);

  return { isFocused };
}

export default useFocus;
