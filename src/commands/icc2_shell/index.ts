import type { Command } from '../../commands.js'

const icc2Shell: Command = {
  type: 'local-jsx',
  name: 'icc2_shell',
  aliases: ['icc2', 'icc'],
  description: 'Send ICC2-oriented commands to the shared right-pane terminal',
  argumentHint: '[command|send|read|status|focus|interrupt] ...',
  load: () => import('./icc2_shell.js'),
}

export default icc2Shell
