import type { Command } from '../../commands.js'

const innovus: Command = {
  type: 'local-jsx',
  name: 'innovus',
  aliases: ['inv'],
  description: 'Send Innovus-oriented commands to the shared right-pane terminal',
  argumentHint: '[command|send|read|status|focus|interrupt] ...',
  load: () => import('./innovus.js'),
}

export default innovus
