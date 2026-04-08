import type { Command } from '../../commands.js'

const vimterm: Command = {
  type: 'local-jsx',
  name: 'tvim',
  aliases: ['vimterm', 'vim-pane', 'tv'],
  description: 'Control the shared right-pane terminal when it is in vim-like editor mode',
  argumentHint: '[send|read|status|focus|interrupt] ...',
  load: () => import('./vimterm.js'),
}

export default vimterm
