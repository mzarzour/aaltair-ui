// Builds a temporary next/og route and checks actual Worker PNG responses.
// The fixture is removed on exit; rebuild before deployment to remove it from dist.
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const route = new URL('../app/api/og-verification/', import.meta.url);
const port = 5189;
let worker;
await mkdir(route); // Refuse to overwrite an existing route.
try {
  await writeFile(new URL('route.ts', route), `
import { ImageResponse } from 'next/og';
import { createElement } from 'react';
export function GET() {
  return new ImageResponse(createElement('div', { style: {
    display: 'flex', width: '100%', height: '100%', backgroundColor: 'white'
  } }, 'Altair <safe> & ready — café'), { width: 320, height: 120 });
}`);
  const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
  assert.equal(build.status, 0, 'Worker fixture build failed');
  worker = spawn(process.execPath, ['--import', './scripts/sites-env.mjs',
    './node_modules/wrangler/bin/wrangler.js', 'dev', '--config', 'dist/server/wrangler.json',
    '--local', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0'],
    { stdio: 'inherit' });
  const url = `http://127.0.0.1:${port}/api/og-verification`;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (worker.exitCode !== null) throw new Error('Worker exited before becoming ready');
    try { await fetch(url, { signal: AbortSignal.timeout(1000) }); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  assert.ok(ready, 'Worker startup timed out');
  // Repeated concurrent requests exercise shared WASM initialization and reuse.
  await Promise.all(Array.from({ length: 3 }, async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /image\/png/);
    const png = Buffer.from(await response.arrayBuffer());
    assert.deepEqual([...png.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
    assert.equal(png.readUInt32BE(16), 320);
    assert.equal(png.readUInt32BE(20), 120);
    assert.ok(png.length > 1000, 'PNG unexpectedly empty');
  }));
  console.log('Worker image rendering verified: three concurrent 320×120 PNGs.');
} finally {
  if (worker && worker.exitCode === null) {
    const stopped = new Promise(resolve => worker.once('exit', resolve));
    worker.kill('SIGTERM');
    await stopped;
  }
  await rm(route, { recursive: true, force: true });
}
