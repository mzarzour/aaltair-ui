import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

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

// Exercise the patched Satori release with the advisory's SVG text boundary.
test('Satori escapes SVG title content instead of injecting markup', async () => {
  const ogDir = dirname(require.resolve('@vercel/og'));
  const fromOg = createRequire(join(ogDir, 'index.node.js'));
  const satoriDir = dirname(fromOg.resolve('satori'));
  const { default: satori } = await import(pathToFileURL(join(satoriDir, 'index.js')));
  const svg = await satori(createElement('svg', { width: 100, height: 100 },
    createElement('title', null, '</title><script>unsafe</script>')), {
    width: 100, height: 100,
    fonts: [{ name: 'Geist', data: readFileSync(join(ogDir, 'Geist-Regular.ttf')), weight: 400, style: 'normal' }],
  });
  const decoded = decodeURIComponent(svg);
  assert.ok(decoded.includes('&lt;/title&gt;&lt;script&gt;unsafe&lt;/script&gt;'));
  assert.ok(!decoded.includes('<script>'));
});
