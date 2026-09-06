const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { scanNutritionLabel, MAX_LABEL_IMAGE_BYTES } = require('../src/services/nutritionLabelScan');

test('rejects invalid, oversized, vector, and excessive-pixel images', async () => {
  await assert.rejects(scanNutritionLabel(Buffer.from('not an image')), { statusCode: 400 });
  await assert.rejects(scanNutritionLabel(Buffer.alloc(MAX_LABEL_IMAGE_BYTES + 1)), { statusCode: 413 });
  await assert.rejects(scanNutritionLabel(Buffer.from('<svg width="100" height="100"></svg>')), { statusCode: 400 });
  const oversized = await sharp({ create: { width: 5100, height: 5100, channels: 3, background: 'white' } }).png().toBuffer();
  await assert.rejects(scanNutritionLabel(oversized), { statusCode: 400 });
});

test('real local OCR extracts a label, bounds concurrency, and releases its worker', { timeout: 60_000 }, async () => {
  const svg = '<svg width="1000" height="680" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><g fill="black" font-family="Arial" font-size="40"><text x="40" y="70" font-size="64" font-weight="bold">Nutrition Facts</text><text x="40" y="145">8 servings per container</text><text x="40" y="220">Serving size 2 tbsp (32 g)</text><text x="40" y="305">Amount per serving</text><text x="40" y="395" font-size="64" font-weight="bold">Calories 190</text><text x="40" y="485">Total Fat 16g</text><text x="40" y="555">Total Carbohydrate 7g</text><text x="40" y="625">Protein 7g</text></g></svg>';
  const image = await sharp(Buffer.from(svg)).png().toBuffer();
  const pending = scanNutritionLabel(image);
  await assert.rejects(scanNutritionLabel(image), { statusCode: 503 });
  const result = await pending;
  assert.equal(result.serving_size_quantity, 2);
  assert.equal(result.serving_unit_label, 'tbsp (32 g)');
  assert.equal(result.calories_per_serving, 190);
  // The next request reaches validation, proving that the scan slot was released.
  await assert.rejects(scanNutritionLabel(Buffer.from('invalid')), { statusCode: 400 });
});
