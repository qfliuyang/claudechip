import type { Command } from '../../commands.js'

const term: Command = {
  type: 'local-jsx',
  name: 'term',
  description: 'Send a command to the integrated terminal panel',
  load: () => import('./term.js'),
}

export default term
