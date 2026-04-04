export type TwoPaneFocusOwner = 'left' | 'right';

export interface TwoPaneFocusState {
  owner: TwoPaneFocusOwner;
  rightPaneVisible: boolean;
}

export function createTwoPaneFocusState(
  rightPaneVisible: boolean,
  owner: TwoPaneFocusOwner = 'left',
): TwoPaneFocusState {
  return {
    owner: rightPaneVisible ? owner : 'left',
    rightPaneVisible,
  };
}

export function withRightPaneVisibility(
  state: TwoPaneFocusState,
  rightPaneVisible: boolean,
): TwoPaneFocusState {
  if (!rightPaneVisible) {
    return { owner: 'left', rightPaneVisible: false };
  }
  return { owner: state.owner, rightPaneVisible: true };
}

export function onTabFromLeft(state: TwoPaneFocusState): TwoPaneFocusState {
  if (!state.rightPaneVisible) return state;
  return { ...state, owner: 'right' };
}

export function onTabFromRight(state: TwoPaneFocusState): TwoPaneFocusState {
  return { ...state, owner: 'left' };
}

