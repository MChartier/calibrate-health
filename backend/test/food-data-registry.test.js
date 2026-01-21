const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * Execute a callback with the food data registry loaded with fresh module state.
 *
 * The registry keeps a module-level provider cache, so we clear the require cache and
 * temporarily apply environment overrides for the duration of the callback.
 */
function withFoodDataModule(envOverrides, fn) {
  const priorEnv = {};
  for (const [key, value] of Object.entries(envOverrides || {})) {
    priorEnv[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  try {
    const modulePath = require.resolve('../src/services/foodData');
    delete require.cache[modulePath];
    const mod = require('../src/services/foodData');
    return fn(mod);
  } finally {
    for (const [key, value] of Object.entries(priorEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('foodData registry: listFoodDataProviders marks FatSecret + USDA as not ready when credentials are missing', () => {
  withFoodDataModule(
    { FATSECRET_CLIENT_ID: undefined, FATSECRET_CLIENT_SECRET: undefined, USDA_API_KEY: undefined },
    ({ listFoodDataProviders }) => {
      const providers = listFoodDataProviders();
      const usda = providers.find((p) => p.name === 'usda');
      const fatsecret = providers.find((p) => p.name === 'fatsecret');
      const off = providers.find((p) => p.name === 'openFoodFacts');

      assert.equal(Boolean(usda), true);
      assert.equal(usda.ready, false);
      assert.equal(usda.detail, 'Missing USDA_API_KEY');

      assert.equal(Boolean(fatsecret), true);
      assert.equal(fatsecret.ready, false);
      assert.equal(fatsecret.detail, 'Missing FATSECRET_CLIENT_ID, FATSECRET_CLIENT_SECRET');

      assert.equal(Boolean(off), true);
      assert.equal(off.ready, true);
    }
  );
});

test('foodData registry: listFoodDataProviders marks FatSecret as ready when credentials are present', () => {
  withFoodDataModule(
    { FATSECRET_CLIENT_ID: 'client-id', FATSECRET_CLIENT_SECRET: 'client-secret' },
    ({ listFoodDataProviders }) => {
      const providers = listFoodDataProviders();
      const fatsecret = providers.find((p) => p.name === 'fatsecret');
      assert.equal(fatsecret.ready, true);
    }
  );
});

test('foodData registry: listFoodDataProviders marks USDA as ready when API key is present', () => {
  withFoodDataModule({ USDA_API_KEY: 'test-key' }, ({ listFoodDataProviders }) => {
    const providers = listFoodDataProviders();
    const usda = providers.find((p) => p.name === 'usda');
    assert.equal(usda.ready, true);
  });
});

test('foodData registry: getFoodDataProviderByName returns a friendly error for missing FatSecret credentials', () => {
  withFoodDataModule(
    { FATSECRET_CLIENT_ID: undefined, FATSECRET_CLIENT_SECRET: undefined },
    ({ getFoodDataProviderByName }) => {
      const resolution = getFoodDataProviderByName('fatsecret');
      assert.equal(resolution.provider, undefined);
      assert.match(resolution.error, /FATSECRET_CLIENT_ID/);
    }
  );
});

test('foodData registry: getFoodDataProviderByName returns a friendly error for missing USDA key', () => {
  withFoodDataModule({ USDA_API_KEY: undefined }, ({ getFoodDataProviderByName }) => {
    const resolution = getFoodDataProviderByName('usda');
    assert.equal(resolution.provider, undefined);
    assert.match(resolution.error, /USDA_API_KEY is missing/);
  });
});

test('foodData registry: getFoodDataProviderByName caches provider instances', () => {
  withFoodDataModule(
    {
      USDA_API_KEY: 'test-key',
      FATSECRET_CLIENT_ID: 'client-id',
      FATSECRET_CLIENT_SECRET: 'client-secret'
    },
    ({ getFoodDataProviderByName }) => {
      const first = getFoodDataProviderByName('usda');
      const second = getFoodDataProviderByName('usda');

      assert.equal(first.provider?.name, 'usda');
      assert.equal(first.provider, second.provider);

      const fs1 = getFoodDataProviderByName('fatsecret');
      const fs2 = getFoodDataProviderByName('fatsecret');
      assert.equal(fs1.provider?.name, 'fatsecret');
      assert.equal(fs1.provider, fs2.provider);

      const off1 = getFoodDataProviderByName('openFoodFacts');
      const off2 = getFoodDataProviderByName('openFoodFacts');
      assert.equal(off1.provider?.name, 'openFoodFacts');
      assert.equal(off1.provider, off2.provider);
    }
  );
});

test('foodData registry: getFoodDataProvider defaults to FatSecret when credentials are present', () => {
  withFoodDataModule(
    {
      FOOD_DATA_PROVIDER: undefined,
      FATSECRET_CLIENT_ID: 'client-id',
      FATSECRET_CLIENT_SECRET: 'client-secret'
    },
    ({ getFoodDataProvider }) => {
      const first = getFoodDataProvider();
      const second = getFoodDataProvider();

      assert.equal(first.name, 'fatsecret');
      assert.equal(first, second);
    }
  );
});

test('foodData registry: getFoodDataProvider falls back when FatSecret credentials are missing', () => {
  const warnCalls = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    warnCalls.push(args.join(' '));
  };

  try {
    withFoodDataModule(
      { FOOD_DATA_PROVIDER: undefined, FATSECRET_CLIENT_ID: undefined, FATSECRET_CLIENT_SECRET: undefined },
      ({ getFoodDataProvider }) => {
        const provider = getFoodDataProvider();
        assert.equal(provider.name, 'openFoodFacts');
      }
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnCalls.length > 0, true);
});

test('foodData registry: getFoodDataProvider falls back when configured for USDA without an API key', () => {
  const warnCalls = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    warnCalls.push(args.join(' '));
  };

  try {
    withFoodDataModule({ FOOD_DATA_PROVIDER: 'usda', USDA_API_KEY: undefined }, ({ getFoodDataProvider }) => {
      const provider = getFoodDataProvider();
      assert.equal(provider.name, 'openFoodFacts');
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnCalls.length > 0, true);
});
