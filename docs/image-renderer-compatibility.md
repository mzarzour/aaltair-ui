# Image renderer compatibility

The `@vercel/og` override pins 1.0.3, which bundles Satori 0.33.5 and fixes
CVE-2026-94545 / GHSA-wx4j-mvgx-mqwp. Overriding standalone Satori does not
replace the older code embedded in the OG bundle.

This release has HarfBuzz packaging/runtime issues in Node ESM and Cloudflare
Workers. `postinstall` runs `scripts/patch-og-harfbuzz.mjs` to provide the pinned
WASM binary, bypass environment-specific filesystem/URL discovery, and import
precompiled callback wrappers in Workers. Node retains its normal callbacks.
The patch also propagates initialization errors instead of leaving a pending
Promise. It does not alter Satori escaping or rendering logic.

The script verifies SHA-256 hashes of both upstream bundles and the WASM binary
before modifying files. Rerunning it is idempotent. An unexpected version fails
installation deliberately; review the patch when upgrading. Installations using
`--ignore-scripts` must run this script explicitly before building. Remove this
workaround once an upstream release passes the tests below.

Validation (portable execution profile):

```sh
npm ci
node --test tests/*.test.mjs
node scripts/verify-og-worker.mjs
npm run build
```

The Worker check temporarily creates `/api/og-verification`, builds and serves it
on port 5189, checks three concurrent PNG responses, then removes the source
fixture. Run the final build before deployment to remove the fixture from output.
The regular tests verify native Node PNG rendering and SVG title escaping.
