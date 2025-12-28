const test = require('node:test');
const assert = require('node:assert/strict');

const OpenFoodFactsProvider = require('../src/services/foodData/openFoodFactsProvider').default;

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

test('OpenFoodFactsProvider normalizes barcode lookups (nutrients + measures + scaled nutrients)', async () => {
  const originalFetch = globalThis.fetch;

  const previousTimeout = process.env.OFF_TIMEOUT_MS;
  const previousMode = process.env.OFF_SEARCH_MODE;
  process.env.OFF_TIMEOUT_MS = '0';
  process.env.OFF_SEARCH_MODE = 'auto';

  const provider = new OpenFoodFactsProvider();

  if (previousTimeout === undefined) delete process.env.OFF_TIMEOUT_MS;
  else process.env.OFF_TIMEOUT_MS = previousTimeout;
  if (previousMode === undefined) delete process.env.OFF_SEARCH_MODE;
  else process.env.OFF_SEARCH_MODE = previousMode;

  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));

    return createJsonResponse({
      status: 1,
      product: {
        code: '123',
        product_name: 'Test bar',
        brands: 'Acme',
        lc: 'en',
        serving_size: '30g',
        serving_quantity: 30,
        product_quantity: 100,
        quantity: '100g',
        nutriments: {
          'energy-kcal_100g': 50,
          proteins_100g: 2,
          fat_100g: 1,
          carbohydrates_100g: 10
        }
      }
    });
  };

  try {
    const result = await provider.searchFoods({
      barcode: '123',
      quantityInGrams: 50,
      includeIncomplete: false,
      languageCode: 'en'
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/api\/v2\/product\/123/);
    assert.match(calls[0], /lc=en/);

    assert.equal(result.items.length, 1);
    const item = result.items[0];
    assert.equal(item.source, 'openFoodFacts');
    assert.equal(item.barcode, '123');
    assert.equal(item.description, 'Test bar');
    assert.equal(item.brand, 'Acme');

    assert.deepEqual(item.nutrientsPer100g, {
      calories: 50,
      protein: 2,
      fat: 1,
      carbs: 10
    });

    assert.equal(item.nutrientsForRequest.grams, 50);
    assert.equal(item.nutrientsForRequest.nutrients.calories, 25);

    const labels = item.availableMeasures.map((m) => m.label);
    assert.equal(labels.includes('per 100g'), true);
    assert.equal(labels.includes('per serving (30g)'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenFoodFactsProvider omits incomplete products when includeIncomplete=false', async () => {
  const originalFetch = globalThis.fetch;

  const previousTimeout = process.env.OFF_TIMEOUT_MS;
  process.env.OFF_TIMEOUT_MS = '0';
  const provider = new OpenFoodFactsProvider();
  if (previousTimeout === undefined) delete process.env.OFF_TIMEOUT_MS;
  else process.env.OFF_TIMEOUT_MS = previousTimeout;

  globalThis.fetch = async () => {
    return createJsonResponse({
      status: 1,
      product: {
        code: '123',
        product_name: 'Unknown calories',
        nutriments: {}
      }
    });
  };

  try {
    const result = await provider.searchFoods({ barcode: '123', includeIncomplete: false });
    assert.deepEqual(result, { items: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenFoodFactsProvider (auto mode) falls back to legacy search when v2 yields no matches', async () => {
  const originalFetch = globalThis.fetch;

  const previousTimeout = process.env.OFF_TIMEOUT_MS;
  const previousMode = process.env.OFF_SEARCH_MODE;
  process.env.OFF_TIMEOUT_MS = '0';
  process.env.OFF_SEARCH_MODE = 'auto';
  const provider = new OpenFoodFactsProvider();
  if (previousTimeout === undefined) delete process.env.OFF_TIMEOUT_MS;
  else process.env.OFF_TIMEOUT_MS = previousTimeout;
  if (previousMode === undefined) delete process.env.OFF_SEARCH_MODE;
  else process.env.OFF_SEARCH_MODE = previousMode;

  const calls = [];
  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);

    if (href.includes('/api/v2/search')) {
      return createJsonResponse({
        products: [
          {
            code: '999',
            product_name: 'Orange',
            brands: 'FruitCo',
            nutriments: { 'energy-kcal_100g': 10 }
          }
        ]
      });
    }

    if (href.includes('/cgi/search.pl')) {
      return createJsonResponse({
        products: [
          {
            code: '111',
            product_name: 'Apple juice',
            brands: 'JuiceCo',
            nutriments: { 'energy-kcal_100g': 40 }
          }
        ]
      });
    }

    throw new Error(`Unexpected URL: ${href}`);
  };

  try {
    const result = await provider.searchFoods({ query: 'apple', includeIncomplete: false });
    assert.equal(calls.some((href) => href.includes('/api/v2/search')), true);
    assert.equal(calls.some((href) => href.includes('/cgi/search.pl')), true);

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].description.toLowerCase().includes('apple'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
