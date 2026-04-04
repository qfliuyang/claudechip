import type { Command } from '../../commands.js'

const term: Command = {
  type: 'local-jsx',
  name: 'term',
  aliases: ['t'],
  description: 'Manage and control the integrated terminal session',
  argumentHint: '[run|send|read|status|focus|restart|interrupt] ...',
  load: () => import('./term.js'),
}

export default term
