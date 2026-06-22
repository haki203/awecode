import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = 5187;
const proc = spawn('node', ['packages/web/dist/server/index.js', '--no-tls', '--port', String(PORT)], {
  env: { ...process.env, AWECODE_CONFIG_PATH: process.env.HOME + '/.awecode/config.json' },
});

let token = '';
proc.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  const match = text.match(/Token:\s*([0-9a-f]+)/);
  if (match) token = match[1];
});

// Wait for "awecode web ready"
await once(proc.stdout, 'data');
await new Promise((r) => setTimeout(r, 500));

// HTTP check
const r1 = await fetch(`http://localhost:${PORT}/`);
if (!r1.ok) { console.error('FAIL: GET /'); process.exit(1); }

const r2 = await fetch(`http://localhost:${PORT}/api/sessions`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!r2.ok) { console.error('FAIL: GET /api/sessions'); process.exit(1); }
const arr = await r2.json();
if (!Array.isArray(arr)) { console.error('FAIL: not array'); process.exit(1); }

// WebSocket check
const { WebSocket } = await import('ws');
const ws = new WebSocket(`ws://localhost:${PORT}/agent?token=${token}`);
const events = [];
ws.on('message', (raw) => events.push(JSON.parse(raw.toString())));
await once(ws, 'open');
ws.send(JSON.stringify({ type: 'prompt', text: '__smoke__' }));
await new Promise((r) => setTimeout(r, 2000));
if (!events.some((e) => e.type === 'ready')) { console.error('FAIL: no ready event'); process.exit(1); }
if (!events.some((e) => e.type === 'message')) { console.error('FAIL: no message event'); process.exit(1); }

ws.close();
proc.kill('SIGINT');
console.log('PASS');
process.exit(0);
