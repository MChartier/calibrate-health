const test = require('node:test');
const assert = require('node:assert/strict');

const UsdaFoodDataProvider = require('../src/services/foodData/usdaFoodDataProvider').default;

function createJsonResponse(data, opts = {}) {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? true;
  return {
    ok,
    status,
    async json() {
      return data;
    },
    async text() {
      return typeof data === 'string' ? data : JSON.stringify(data);
    }
  };
}

test('UsdaFoodDataProvider normalizes search results (measures + nutrients per 100g + scaled nutrients)', async () => {
  const provider = new UsdaFoodDataProvider('test-key');
  const originalFetch = globalThis.fetch;

  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });

    return createJsonResponse({
      foods: [
        {
          fdcId: 1,
          description: 'Test food',
          brandOwner: 'Acme',
          gtinUpc: '012345',
          householdServingFullText: '2 oz',
          servingSize: 2,
          servingSizeUnit: 'oz',
          labelNutrients: {
            calories: { value: 100 },
            protein: { value: 10 },
            fat: { value: 5 },
            carbohydrates: { value: 20 }
          },
          foodPortions: [{ modifier: 'slice', gramWeight: 30 }]
        }
      ]
    });
  };

  try {
    const result = await provider.searchFoods({
      query: 'test',
      page: 2,
      pageSize: 15,
      quantityInGrams: 50,
      includeIncomplete: false
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/foods\/search\?api_key=test-key/);
    assert.equal(calls[0].options?.method, 'POST');

    const body = JSON.parse(calls[0].options?.body ?? '{}');
    assert.equal(body.query, 'test');
    assert.equal(body.pageSize, 15);
    assert.equal(body.pageNumber, 2);

    assert.equal(result.items.length, 1);
    const item = result.items[0];
    assert.equal(item.source, 'usda');
    assert.equal(item.id, '1');
    assert.equal(item.description, 'Test food');
    assert.equal(item.brand, 'Acme');
    assert.equal(item.barcode, '012345');

    // 2 oz -> 56.7g; factor = 100/56.7 -> 1.7636...
    assert.deepEqual(item.nutrientsPer100g, {
      calories: 176.4,
      protein: 17.64,
      fat: 8.82,
      carbs: 35.27
    });

    assert.equal(item.nutrientsForRequest.grams, 50);
    assert.equal(item.nutrientsForRequest.nutrients.calories, 88.2);

    const labels = item.availableMeasures.map((m) => m.label);
    assert.equal(labels.includes('2 oz'), true);
    assert.equal(labels.includes('slice'), true);
    assert.equal(labels.includes('per 100g'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

