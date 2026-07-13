import assert from 'node:assert/strict';
import test from 'node:test';
import { findTextNode, parseBounds } from './wear-emulator-smoke.mjs';

test('Wear smoke parser derives tap coordinates from the UI tree', () => {
  const xml = '<hierarchy><node text="Connection" bounds="[24,156][430,260]" /></hierarchy>';

  const node = findTextNode(xml, 'Connection');
  assert.deepEqual(node, { text: 'Connection', bounds: '[24,156][430,260]' });
  assert.deepEqual(parseBounds(node.bounds), { x: 227, y: 208 });
});

test('Wear smoke parser rejects malformed bounds and missing text', () => {
  assert.equal(findTextNode('<hierarchy />', 'Connection'), null);
  assert.throws(() => parseBounds('24,156,430,260'), /Invalid Android bounds/);
});
