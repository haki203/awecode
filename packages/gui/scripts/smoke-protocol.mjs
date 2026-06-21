// Smoke test: spawn the CLI in --internal mode, wait for `ready` event,
// then send exit. Verifies the NDJSON protocol wiring without needing
// a real LLM provider (we just check the initial handshake).
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const child = spawn(
  process.execPath,
  ['packages/cli/dist/index.js', 'open', 'gui', '--internal'],
  { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] },
);

let events = 0;
let readySeen = false;
const rl = createInterface({ input: child.stdout });
rl.on('line', (line) => {
  if (!line.trim()) return;
  events++;
  console.log('EVENT:', line);
  try {
    const ev = JSON.parse(line);
    if (ev.type === 'ready') readySeen = true;
    if (ev.type === 'ready' || ev.type === 'error' || ev.type === 'done') {
      // After the initial handshake, tell the server to exit.
      if (ev.type !== 'done') {
        setTimeout(() => {
          child.stdin.write(JSON.stringify({ type: 'exit' }) + '\n');
        }, 100);
      }
    }
  } catch {
    /* ignore */
  }
});

const errRl = createInterface({ input: child.stderr });
errRl.on('line', (line) => console.log('STDERR:', line));

const timeout = setTimeout(() => {
  console.error('TIMEOUT — hanging');
  child.kill('SIGKILL');
  process.exit(1);
}, 8000);

child.on('exit', (code) => {
  clearTimeout(timeout);
  console.log(`\nEXIT code=${code} events=${events} readySeen=${readySeen}`);
  if (readySeen && events >= 1) {
    console.log('SMOKE TEST: PASS');
    process.exit(0);
  } else {
    console.log('SMOKE TEST: FAIL');
    process.exit(1);
  }
});
