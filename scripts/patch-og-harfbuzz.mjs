/** @vercel/og 1.0.3 packaging compatibility repair; Satori security code is untouched.
 * Supplies missing HarfBuzz WASM, ESM-safe initialization and static Worker callbacks.
 * All upstream inputs are hash-checked. Remove after an upstream replacement passes tests.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const ogDir = dirname(require.resolve('@vercel/og'));
const fromOg = createRequire(join(ogDir, 'index.node.js'));
const fromSatori = createRequire(fromOg.resolve('satori'));
const hbDir = dirname(fromSatori.resolve('harfbuzzjs'));
const marker = '// Altair: pinned HarfBuzz loader compatibility patch v1\n';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const originals = {
  node: '3269eb15ca135a0eb7e07ddf8af0b35711d6e75c56b84c6a6727c5626d59409c',
  edge: '919b0243f4f431b163ba0a56e3153e9417769db090d19e6dd22b5681d4126d67',
};
const wasm = readFileSync(join(hbDir, 'hb.wasm'));
if (sha256(wasm) !== 'd2ab975172d6103e7624e8f7f03fea2316eca6fe562e1b80fc7f7058b283a6d0')
  throw new Error('Unexpected HarfBuzz WASM; review the compatibility patch');
// Every callback signature used by the pinned hbjs. Each static module imports and
// re-exports a typed JS callback, just like Emscripten's runtime-generated wrapper.
const signatures = ['vi','viiiffi','viiiffffffi','viiiffffi','viiii','ippipp',
  'ipppipp','ippip','ippippp','ippiip','ippipip','ippiipp','ipppp','iiiii'];
const env = 'var ENVIRONMENT_IS_NODE = typeof process == "object" && process.versions?.node && process.type != "renderer";';
const workerEnv = 'var ENVIRONMENT_IS_WORKER = typeof WorkerGlobalScope != "undefined";';
const nodeCall = 'hb({ wasmBinary: readHarfBuzzWasm(new URL("./hb.wasm", import.meta.url)) }).then((instance) => {';
const edgeCall = 'hb({ instantiateWasm(imports, receive) { queueMicrotask(() => { const instance = new WebAssembly.Instance(harfBuzzWasm, imports); receive(instance, harfBuzzWasm); }); return {}; } }).then((instance) => {';
const pending = [];
for (const runtime of ['node', 'edge']) {
  const file = join(ogDir, `index.${runtime}.js`);
  const source = readFileSync(file, 'utf8');
  const prefix = runtime === 'node'
    ? 'import { readFileSync as readHarfBuzzWasm } from "node:fs";\n'
    : 'import harfBuzzWasm from "./hb.wasm?module";\n' + signatures.map((sig, i) =>
      `import hbCallback${i} from "./hb-callback-${sig}.wasm?module";\n`).join('') +
      `const harfBuzzCallbacks = {${signatures.map((sig,i) => `${sig}:hbCallback${i}`).join(',')}};\n`;
  const edits = [
    [env, 'var ENVIRONMENT_IS_NODE = false; // WASM supplied explicitly by Altair'],
    [workerEnv, 'var ENVIRONMENT_IS_WORKER = false; // No worker URL required'],
    ['hb().then((instance) => {', runtime === 'node' ? nodeCall : edgeCall],
    // The upstream Promise executor loses exceptions thrown while constructing hbjs.
    ['resolve(hbjs(instance));', 'try { resolve(hbjs(instance)); } catch (error) { reject(error); }'],
  ];
  if (runtime === 'edge') edits.push([
    'var module2 = new WebAssembly.Module(bytes);',
    'var module2 = harfBuzzCallbacks[sig]; if (!module2) throw new Error("Unsupported HarfBuzz callback: " + sig);',
  ]);
  let original = source;
  if (source.startsWith(marker + prefix)) {
    original = source.slice((marker + prefix).length);
    for (const [before, after] of edits) original = original.replace(after, before);
  }
  if (sha256(original) !== originals[runtime])
    throw new Error(`Unexpected OG ${runtime} bundle; review the compatibility patch`);
  let patched = original;
  for (const [before, after] of edits) {
    if (patched.split(before).length !== 2) throw new Error('Ambiguous HarfBuzz patch target');
    patched = patched.replace(before, after);
  }
  pending.push([file, marker + prefix + patched]);
}
// Validate both bundles before changing either. Regenerate missing assets on reruns.
const pack = values => [values.length % 128 | 128, values.length >> 7, ...values];
const types = {i:127,p:127,j:126,f:125,d:124,e:111};
for (const sig of signatures) {
  const type = [1,96,...pack([...sig.slice(1)].map(c=>types[c])),...pack(sig[0]==='v'?[]:[types[sig[0]]])];
  const bytes = Uint8Array.of(0,97,115,109,1,0,0,0,1,...pack(type),2,7,1,1,101,1,102,0,0,7,5,1,1,102,0,0);
  new WebAssembly.Module(bytes); // Validate at install time, never in Workers.
  writeFileSync(join(ogDir, `hb-callback-${sig}.wasm`), bytes);
}
copyFileSync(join(hbDir, 'hb.wasm'), join(ogDir, 'hb.wasm'));
for (const [file, contents] of pending) writeFileSync(file, contents);
console.log('Verified @vercel/og HarfBuzz compatibility patch (Node + Workers).');
