import { describe, expect, test } from 'bun:test'
import { join } from 'path'
import { EdaKnowledgeGateway } from '../src/eda-kb/EdaKnowledgeGateway.js'
import { KnowledgePackStore } from '../src/eda-kb/store/KnowledgePackStore.js'

const fixtureRoot = join(process.cwd(), 'tests', 'fixtures', 'eda-kb', 'packs')

describe('EdaKnowledgeGateway', () => {
  test('loads a pack and returns PT evidence for timing-debug query', async () => {
    const gateway = new EdaKnowledgeGateway(new KnowledgePackStore([fixtureRoot]))

    const result = await gateway.lookup({
      query: 'debug clock tree latency with report_timing',
      terminalContext: {
        mode: 'pt_shell',
        transport: 'ssh',
        app: 'pt_shell',
        host: 'eda01',
        promptReady: true,
        confidence: 0.98,
        summary: 'ssh:eda01 · pt_shell · ready',
        recentCommand: 'pt_shell',
        lastHumanInputAt: null,
        lastToolInputAt: null,
      },
    })

    expect(result.route.shouldRetrieve).toBe(true)
    expect(result.evidence?.tool).toBe('pt')
    expect(result.evidence?.commands[0]?.commandName).toBe('report_timing')
    expect(result.evidence?.concepts[0]?.topic).toBe('clock tree latency')
    expect(result.evidence?.citations[0]?.authorityTag).toBe('official_vendor_document')
    expect(result.evidence?.citations[0]?.reliabilityTag).toBe('authoritative')
    expect(result.promptBlock).toContain('# EDA Knowledge Context')
    expect(result.promptBlock).toContain('Source trust tags')
    expect(result.promptBlock).toContain('[official_vendor_document | authoritative]')
    expect(result.promptBlock).toContain('report_timing')
  })

  test('reports missing pack when namespace has no local knowledge pack', async () => {
    const gateway = new EdaKnowledgeGateway(new KnowledgePackStore([fixtureRoot]))

    const result = await gateway.lookup({
      query: 'how to debug ccopt latency',
      terminalContext: {
        mode: 'innovus',
        transport: 'ssh',
        app: 'innovus',
        host: 'eda01',
        promptReady: true,
        confidence: 0.98,
        summary: 'ssh:eda01 · innovus · ready',
        recentCommand: 'innovus',
        lastHumanInputAt: null,
        lastToolInputAt: null,
      },
    })

    expect(result.route.shouldRetrieve).toBe(true)
    expect(result.evidence?.health.status).toBe('missing_pack')
    expect(result.promptBlock).toContain('Pack health: `missing_pack`')
  })
})
