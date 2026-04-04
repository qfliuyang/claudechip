const pty = require('node-pty');
const shell = process.env.SHELL || '/bin/bash';
console.log('SHELL=', shell);
const p = pty.spawn(shell, [], {
  cwd: '/Users/luzi/code/cc-claudechip',
  env: process.env,
  cols: 80,
  rows: 24,
  name: 'xterm-256color',
});
console.log('spawned pid=', p.pid);
p.onData(d => console.log('DATA:', JSON.stringify(d)));
p.onExit(({exitCode, signal}) => console.log('EXIT', exitCode, signal));
setTimeout(() => {
  console.log('writing echo hello');
  p.write('echo hello\n');
}, 500);
setTimeout(() => {
  console.log('killing');
  p.kill();
  process.exit(0);
}, 1500);
