import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import type { KnowledgePack } from '../EdaKnowledgeTypes.js'

function toJsonLines(records: unknown[]): string {
  return records.map(record => JSON.stringify(record)).join('\n')
}

export async function writeKnowledgePack(
  rootDir: string,
  pack: KnowledgePack,
): Promise<string> {
  const packDir = join(
    rootDir,
    pack.manifest.vendor,
    pack.manifest.tool,
    pack.manifest.version,
  )

  await mkdir(join(packDir, 'indexes'), { recursive: true })

  await Promise.all([
    writeFile(
      join(packDir, 'manifest.json'),
      `${JSON.stringify(pack.manifest, null, 2)}\n`,
      'utf8',
    ),
    writeFile(join(packDir, 'commands.jsonl'), `${toJsonLines(pack.commands)}\n`, 'utf8'),
    writeFile(join(packDir, 'concepts.jsonl'), `${toJsonLines(pack.concepts)}\n`, 'utf8'),
    writeFile(join(packDir, 'flows.jsonl'), `${toJsonLines(pack.flows)}\n`, 'utf8'),
    writeFile(join(packDir, 'chunks.jsonl'), `${toJsonLines(pack.chunks)}\n`, 'utf8'),
    writeFile(
      join(packDir, 'health.json'),
      `${JSON.stringify(pack.health, null, 2)}\n`,
      'utf8',
    ),
  ])

  return packDir
}
