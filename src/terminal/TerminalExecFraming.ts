export const MARKER_PREFIX = '__CLAUDECHIP_TERMINAL_BASH__';

export type ParsedExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type ExecMarkers = {
  startMarker: string;
  endMarker: string;
  stdoutStartMarker: string;
  stdoutEndMarker: string;
  stderrStartMarker: string;
  stderrEndMarker: string;
};

export function createExecMarkers(id: string): ExecMarkers {
  return {
    startMarker: `${MARKER_PREFIX}START_${id}`,
    endMarker: `${MARKER_PREFIX}END_${id}`,
    stdoutStartMarker: `${MARKER_PREFIX}STDOUT_START_${id}`,
    stdoutEndMarker: `${MARKER_PREFIX}STDOUT_END_${id}`,
    stderrStartMarker: `${MARKER_PREFIX}STDERR_START_${id}`,
    stderrEndMarker: `${MARKER_PREFIX}STDERR_END_${id}`,
  };
}

export function buildWrappedCommand(
  command: string,
  markers: ExecMarkers,
): string {
  const commandBase64 = Buffer.from(command, 'utf-8').toString('base64');
  return (
    `printf '${markers.startMarker}\\n'\n` +
    `__cc_dir="$(mktemp -d 2>/dev/null || mktemp -d -t claudechip)"\n` +
    `__cc_cmd="$__cc_dir/cmd.sh"\n` +
    `__cc_out="$__cc_dir/stdout"\n` +
    `__cc_err="$__cc_dir/stderr"\n` +
    `printf '${commandBase64}' | base64 -d > "$__cc_cmd"\n` +
    `. "$__cc_cmd" >"$__cc_out" 2>"$__cc_err"\n` +
    `__cc_exit="$?"\n` +
    `printf '${markers.stdoutStartMarker}\\n'\n` +
    `cat "$__cc_out"\n` +
    `printf '\\n${markers.stdoutEndMarker}\\n'\n` +
    `printf '${markers.stderrStartMarker}\\n'\n` +
    `cat "$__cc_err"\n` +
    `printf '\\n${markers.stderrEndMarker}\\n'\n` +
    `printf '${markers.endMarker}:%s\\n' "$__cc_exit"\n` +
    `rm -rf "$__cc_dir"\n`
  );
}

export function parseFramedResult(
  buffer: string,
  markers: ExecMarkers,
): ParsedExecResult | null {
  const start = buffer.lastIndexOf(markers.startMarker);
  const endPrefixIndex = buffer.lastIndexOf(`${markers.endMarker}:`);
  if (start === -1 || endPrefixIndex === -1 || endPrefixIndex <= start) {
    return null;
  }

  const region = buffer.slice(start, endPrefixIndex);
  const endLine = buffer.slice(endPrefixIndex).split('\n')[0] ?? '';
  const exitCode = Number.parseInt(endLine.slice(`${markers.endMarker}:`.length), 10);
  if (Number.isNaN(exitCode)) {
    return null;
  }

  const stdoutStart = region.indexOf(markers.stdoutStartMarker);
  const stdoutEnd = region.indexOf(markers.stdoutEndMarker);
  const stderrStart = region.indexOf(markers.stderrStartMarker);
  const stderrEnd = region.indexOf(markers.stderrEndMarker);
  if (
    stdoutStart === -1 ||
    stdoutEnd === -1 ||
    stderrStart === -1 ||
    stderrEnd === -1 ||
    stdoutEnd < stdoutStart ||
    stderrEnd < stderrStart
  ) {
    return null;
  }

  const stdout = region
    .slice(stdoutStart + markers.stdoutStartMarker.length, stdoutEnd)
    .replace(/^\n/, '')
    .replace(/\n$/, '');
  const stderr = region
    .slice(stderrStart + markers.stderrStartMarker.length, stderrEnd)
    .replace(/^\n/, '')
    .replace(/\n$/, '');

  return { exitCode, stdout, stderr };
}

