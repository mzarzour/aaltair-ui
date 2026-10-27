import assert from 'node:assert/strict';
import test from 'node:test';
import { connectorResponse } from '../lib/connector-errors.mts';

test('accepts success content and removes untrusted envelope fields', async () => {
  const response = connectorResponse({status: 'success', requestId: 'request-123',
    result: {content: [{type: 'text', text: 'ok'}], structuredContent: {count: 1}},
    unexpected: 'discard'});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(await response.json(), {status: 'success', requestId: 'request-123',
    result: {content: [{type: 'text', text: 'ok'}], structuredContent: {count: 1}}});
});

test('preserves a valid failure and retry delay', async () => {
  const value = {status: 'rate_limited', message: 'Try later', retryAfterMs: 1000};
  const response = connectorResponse(value);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), value);
});

test('rejects malformed, contradictory and nonserializable responses', async () => {
  for (const value of [null, {status: 'success'},
    {status: 'success', result: {content: []}, error: 'contradiction'},
    {status: 'rate_limited', message: 'Try later', retryAfterMs: -1},
    {status: 'success', result: {content: [], structuredContent: {bad: BigInt(1)}}}]) {
    const response = connectorResponse(value);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).status, 'upstream_error');
  }
});
