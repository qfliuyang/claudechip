import { expect, test } from 'bun:test'
import {
  buildWrappedCommand,
  parseFramedResult,
} from '../src/tools/TerminalBashTool/TerminalBashTool.ts'

const markers = {
  startMarker: '__CLAUDECHIP_TERMINAL_BASH__START_abc',
  endMarker: '__CLAUDECHIP_TERMINAL_BASH__END_abc',
  stdoutStartMarker: '__CLAUDECHIP_TERMINAL_BASH__STDOUT_START_abc',
  stdoutEndMarker: '__CLAUDECHIP_TERMINAL_BASH__STDOUT_END_abc',
  stderrStartMarker: '__CLAUDECHIP_TERMINAL_BASH__STDERR_START_abc',
  stderrEndMarker: '__CLAUDECHIP_TERMINAL_BASH__STDERR_END_abc',
}

test('buildWrappedCommand includes framing markers', () => {
  const command = buildWrappedCommand('echo hi', markers)
  expect(command).toContain(markers.startMarker)
  expect(command).toContain(markers.stdoutStartMarker)
  expect(command).toContain(markers.stdoutEndMarker)
  expect(command).toContain(markers.stderrStartMarker)
  expect(command).toContain(markers.stderrEndMarker)
  expect(command).toContain(`${markers.endMarker}:%s`)
})

test('parseFramedResult extracts exitCode/stdout/stderr', () => {
  const buffer =
    `noise\n${markers.startMarker}\n` +
    `${markers.stdoutStartMarker}\n` +
    `hello\nworld\n` +
    `${markers.stdoutEndMarker}\n` +
    `${markers.stderrStartMarker}\n` +
    `warning line\n` +
    `${markers.stderrEndMarker}\n` +
    `${markers.endMarker}:7\n`

  const parsed = parseFramedResult(buffer, markers)
  expect(parsed).not.toBeNull()
  expect(parsed?.exitCode).toBe(7)
  expect(parsed?.stdout).toBe('hello\nworld')
  expect(parsed?.stderr).toBe('warning line')
})

test('parseFramedResult returns null when end marker is missing', () => {
  const broken = `${markers.startMarker}\n${markers.stdoutStartMarker}\nhi\n`
  expect(parseFramedResult(broken, markers)).toBeNull()
})

