const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildExternalIngredientSnapshotRow,
  parseMyFoodIngredientInput
} = require('../src/routes/myFoodsRecipeUtils');

test('myFoodsRecipeUtils: parseMyFoodIngredientInput validates ids and quantities', () => {
  const ok = parseMyFoodIngredientInput({ my_food_id: '123', quantity_servings: '1.5' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { myFoodId: 123, quantityServings: 1.5 });

  const badId = parseMyFoodIngredientInput({ my_food_id: 0, quantity_servings: 1 });
  assert.equal(badId.ok, false);
  assert.equal(badId.error.statusCode, 400);
  assert.equal(badId.error.message, 'Invalid ingredient my_food_id');

  const badQty = parseMyFoodIngredientInput({ my_food_id: 123, quantity_servings: 0 });
  assert.equal(badQty.ok, false);
  assert.equal(badQty.error.statusCode, 400);
  assert.equal(badQty.error.message, 'Invalid ingredient quantity_servings');
});

test('myFoodsRecipeUtils: buildExternalIngredientSnapshotRow validates required fields and normalizes optionals', () => {
  const ok = buildExternalIngredientSnapshotRow(
    {
      name: '  Tomato   sauce ',
      calories_total: '120',
      external_source: '   OF  ',
      grams_total: '250',
      grams_per_measure: 'abc' // invalid optional value -> becomes null
    },
    2
  );

  assert.equal(ok.ok, true);
  assert.equal(ok.value.sort_order, 2);
  assert.equal(ok.value.source, 'EXTERNAL');
  assert.equal(ok.value.name_snapshot, 'Tomato sauce');
  assert.equal(ok.value.calories_total_snapshot, 120);
  assert.equal(ok.value.external_source, 'OF');
  assert.equal(ok.value.grams_total_snapshot, 250);
  assert.equal(ok.value.grams_per_measure_snapshot, null);
});

test('myFoodsRecipeUtils: buildExternalIngredientSnapshotRow rejects invalid inputs', () => {
  const badName = buildExternalIngredientSnapshotRow({ name: '', calories_total: 10 }, 1);
  assert.equal(badName.ok, false);
  assert.equal(badName.error.statusCode, 400);
  assert.equal(badName.error.message, 'Invalid external ingredient name');

  const badCalories = buildExternalIngredientSnapshotRow({ name: 'x', calories_total: 'nope' }, 1);
  assert.equal(badCalories.ok, false);
  assert.equal(badCalories.error.statusCode, 400);
  assert.equal(badCalories.error.message, 'Invalid external ingredient calories_total');
});

