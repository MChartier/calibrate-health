const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { scanNutritionLabel, MAX_LABEL_IMAGE_BYTES } = require('../src/services/nutritionLabelScan');

test('rejects invalid, oversized, vector, and excessive-pixel images', async () => {
  await assert.rejects(scanNutritionLabel(Buffer.from('not an image')), { statusCode: 400 });
  await assert.rejects(scanNutritionLabel(Buffer.alloc(MAX_LABEL_IMAGE_BYTES + 1)), { statusCode: 413 });
  await assert.rejects(scanNutritionLabel(Buffer.from('<svg width="100" height="100"></svg>')), { statusCode: 400 });
  const oversized = await sharp({ create: { width: 5100, height: 5100, channels: 3, background: 'white' } }).png().toBuffer();
  await assert.rejects(scanNutritionLabel(oversized), { statusCode: 400 });
});

test('real local OCR extracts a label, bounds concurrency, and releases its worker', { timeout: 60_000 }, async () => {
  // Fixed pixels keep real OCR coverage independent of the host's installed fonts.
  const image = await readFile(path.join(__dirname, 'fixtures/nutrition-label.png'));
  const pending = scanNutritionLabel(image);
  await assert.rejects(scanNutritionLabel(image), { statusCode: 503 });
  const result = await pending;
  assert.equal(result.serving_size_quantity, 2);
  assert.equal(result.serving_unit_label, 'tbsp (32 g)');
  assert.equal(result.calories_per_serving, 190);
  // The next request reaches validation, proving that the scan slot was released.
  await assert.rejects(scanNutritionLabel(Buffer.from('invalid')), { statusCode: 400 });
});
