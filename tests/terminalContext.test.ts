import { describe, expect, test } from 'bun:test'
import { TerminalContextTracker } from '../src/terminal/TerminalContext.js'

describe('TerminalContextTracker', () => {
  test('detects ssh transport from committed command', () => {
    const tracker = new TerminalContextTracker()

    const snapshot = tracker.recordWrite('ssh eda-server\r', 'human')

    expect(snapshot.mode).toBe('ssh')
    expect(snapshot.transport).toBe('ssh')
    expect(snapshot.host).toBe('eda-server')
    expect(snapshot.sshTarget).toBe('eda-server')
    expect(snapshot.app).toBe('shell')
    expect(snapshot.promptReady).toBe(false)
  })

  test('preserves exact ssh target including user for side-channel reuse', () => {
    const tracker = new TerminalContextTracker()

    const snapshot = tracker.recordWrite('ssh EDA@192.168.112.163\r', 'human')

    expect(snapshot.host).toBe('192.168.112.163')
    expect(snapshot.sshTarget).toBe('EDA@192.168.112.163')
  })

  test('detects vim from command entry and output cues', () => {
    const tracker = new TerminalContextTracker()

    tracker.recordWrite('vim clock_tree.tcl\r', 'human')
    const snapshot = tracker.recordOutput('-- INSERT --')

    expect(snapshot.mode).toBe('vim')
    expect(snapshot.app).toBe('vim')
    expect(snapshot.promptReady).toBe(false)
  })

  test('detects innovus prompt and stays send-capable', () => {
    const tracker = new TerminalContextTracker()

    tracker.recordWrite('innovus\r', 'human')
    const snapshot = tracker.recordOutput('innovus 23> ')

    expect(snapshot.mode).toBe('innovus')
    expect(snapshot.app).toBe('innovus')
    expect(snapshot.promptReady).toBe(true)
    expect(snapshot.summary).toContain('innovus')
  })

  test('detects icc2_shell and pt_shell modes from committed commands', () => {
    const icc2 = new TerminalContextTracker()
    const pt = new TerminalContextTracker()

    const icc2Snapshot = icc2.recordWrite('icc2_shell\r', 'human')
    const ptSnapshot = pt.recordWrite('pt_shell\r', 'human')

    expect(icc2Snapshot.mode).toBe('icc2_shell')
    expect(icc2Snapshot.app).toBe('icc2_shell')
    expect(ptSnapshot.mode).toBe('pt_shell')
    expect(ptSnapshot.app).toBe('pt_shell')
  })

  test('returns to local shell after ssh exit', () => {
    const tracker = new TerminalContextTracker()

    tracker.recordWrite('ssh build-host\r', 'human')
    const snapshot = tracker.recordWrite('exit\r', 'human')

    expect(snapshot.transport).toBe('local')
    expect(snapshot.mode).toBe('shell')
    expect(snapshot.app).toBe('shell')
  })
})
