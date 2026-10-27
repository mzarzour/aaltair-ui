import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createElement } from 'react';

const require = createRequire(import.meta.url);

test('Vinext image renderer still produces PNG output after dependency updates', async () => {
  const fromVinext = createRequire(import.meta.resolve('vinext'));
  const { ImageResponse } = await import(fromVinext.resolve('@vercel/og'));
  const response = new ImageResponse(createElement('div', {
    style: { display: 'flex', width: '100%', height: '100%', backgroundColor: 'white' },
  }, 'Altair <safe> & ready'), { width: 320, height: 120 });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /image\/png/);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('patched esbuild transforms TypeScript for its direct tool consumers', async () => {
  for (const consumer of ['drizzle-kit', 'vite', 'wrangler']) {
    const fromConsumer = createRequire(require.resolve(consumer));
    const esbuild = fromConsumer('esbuild');
    const output = await esbuild.transform('const value: number = 42; export { value };',
      { loader: 'ts', format: 'esm' });
    assert.match(output.code, /42/);
    assert.doesNotMatch(output.code, /: number/);
  }
});
