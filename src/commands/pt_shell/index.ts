import type { Command } from '../../commands.js'

const ptShell: Command = {
  type: 'local-jsx',
  name: 'pt_shell',
  aliases: ['pt', 'pts'],
  description: 'Send PrimeTime-oriented commands to the shared right-pane terminal',
  argumentHint: '[command|send|read|status|focus|interrupt] ...',
  load: () => import('./pt_shell.js'),
}

export default ptShell
