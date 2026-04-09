import type { Message } from '../types/message.js'
import type { TerminalContextSnapshot } from '../terminal/TerminalContext.js'
import { getContentText } from '../utils/messages.js'
import type { EdaKnowledgeLookupRequest } from './EdaKnowledgeTypes.js'

export function buildEdaKnowledgeLookupRequest(
  messages: Message[],
  terminalContext?: TerminalContextSnapshot,
): EdaKnowledgeLookupRequest | null {
  const userTexts = messages
    .filter(message => message.type === 'user' && !message.isMeta)
    .map(message => getContentText(message.message.content).trim())
    .filter(Boolean)

  const query = userTexts.at(-1)
  if (!query) return null

  return {
    query,
    terminalContext,
    limit: 3,
  }
}
