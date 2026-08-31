import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchServerReleaseTagRulesets,
  runServerReleaseTagProtectionCli,
  SERVER_RELEASE_TAG_REF_PATTERN,
  validateServerReleaseTagProtection,
  verifyServerReleaseTagProtection
} from './server-release-tag-protection.mjs';

const REPOSITORY = 'MChartier/calibrate-health';
const TAG = 'v1.2.3';

function ruleset(id, name, ruleTypes, overrides = {}) {
  return {
    id,
    name,
    target: 'tag',
    enforcement: 'active',
    conditions: {
      ref_name: {
        include: [SERVER_RELEASE_TAG_REF_PATTERN],
        exclude: []
      }
    },
    rules: ruleTypes.map((type) => ({ type })),
    ...overrides
  };
}

function validRulesets() {
  return [
    ruleset(21, 'server-release-tag-creation', ['creation']),
    ruleset(22, 'server-release-tag-immutability', ['update', 'deletion'])
  ];
}

function jsonResponse(payload, options = {}) {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  return new Response(options.raw ?? JSON.stringify(payload), {
    status: options.status ?? 200,
    headers
  });
}

function githubFixtureFetch(options = {}) {
  const details = options.details ?? validRulesets();
  const summaries = options.summaries ?? details.map(({ id, name }) => ({ id, name }));
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('?includes_parents=true&targets=tag&per_page=100')) {
      return options.listResponse ?? jsonResponse(summaries);
    }
    const id = Number(String(url).match(/\/rulesets\/(\d+)\?/)?.[1]);
    const detail = details.find((candidate) => candidate.id === id);
    return options.detailResponse?.(id) ?? jsonResponse(detail);
  };
  return { calls, fetchImpl };
}

test('pure validation requires both active exact-scope stable server tag rulesets', () => {
  const result = validateServerReleaseTagProtection(validRulesets(), { tag: TAG });

  assert.equal(result.tag, TAG);
  assert.equal(result.refPattern, 'refs/tags/v*');
  assert.equal(result.rulesets.creation.id, 21);
  assert.deepEqual(result.rulesets.immutability.ruleTypes, ['deletion', 'update']);
});

test('pure validation fails closed when a required ruleset is missing or ambiguous', () => {
  assert.throws(
    () => validateServerReleaseTagProtection(validRulesets().slice(0, 1), { tag: TAG }),
    /server-release-tag-immutability was not found/
  );
  assert.throws(
    () => validateServerReleaseTagProtection([...validRulesets(), validRulesets()[0]], { tag: TAG }),
    /server-release-tag-creation is ambiguous/
  );
});

test('pure validation rejects inactive, non-tag, broad, or excluded rulesets', () => {
  const defects = [
    {
      mutate: (candidate) => { candidate.enforcement = 'evaluate'; },
      message: /must use active enforcement/
    },
    {
      mutate: (candidate) => { candidate.target = 'branch'; },
      message: /must target tags/
    },
    {
      mutate: (candidate) => { candidate.conditions.ref_name.include = ['refs/tags/*']; },
      message: /must include exactly refs\/tags\/v\*/
    },
    {
      mutate: (candidate) => { candidate.conditions.ref_name.include.push('refs/tags/other-*'); },
      message: /must include exactly refs\/tags\/v\*/
    },
    {
      mutate: (candidate) => { candidate.conditions.ref_name.exclude.push('refs/tags/v0.*'); },
      message: /must not exclude/
    }
  ];

  for (const { mutate, message } of defects) {
    const candidates = structuredClone(validRulesets());
    mutate(candidates[0]);
    assert.throws(() => validateServerReleaseTagProtection(candidates, { tag: TAG }), message);
  }
});

test('pure validation requires creation, update, and deletion rules', () => {
  const missingCreation = validRulesets();
  missingCreation[0].rules = [];
  assert.throws(
    () => validateServerReleaseTagProtection(missingCreation, { tag: TAG }),
    /must include the creation rule/
  );

  const missingUpdate = validRulesets();
  missingUpdate[1].rules = [{ type: 'deletion' }];
  assert.throws(
    () => validateServerReleaseTagProtection(missingUpdate, { tag: TAG }),
    /must include the update rule/
  );

  const missingDeletion = validRulesets();
  missingDeletion[1].rules = [{ type: 'update' }];
  assert.throws(
    () => validateServerReleaseTagProtection(missingDeletion, { tag: TAG }),
    /must include the deletion rule/
  );
});

test('pure validation rejects malformed records and non-stable tag names', () => {
  assert.throws(() => validateServerReleaseTagProtection({}, { tag: TAG }), /details are malformed/);
  assert.throws(
    () => validateServerReleaseTagProtection(validRulesets(), { tag: 'v1.2.3-rc.1' }),
    /vMAJOR.MINOR.PATCH/
  );
  assert.throws(
    () => validateServerReleaseTagProtection(validRulesets(), { tag: 'native-v1.2.3' }),
    /vMAJOR.MINOR.PATCH/
  );

  const malformedCondition = validRulesets();
  malformedCondition[0].conditions = {};
  assert.throws(
    () => validateServerReleaseTagProtection(malformedCondition, { tag: TAG }),
    /must define a ref_name condition/
  );

  const malformedRule = validRulesets();
  malformedRule[0].rules = [null];
  assert.throws(
    () => validateServerReleaseTagProtection(malformedRule, { tag: TAG }),
    /rule 1 is malformed/
  );
});

test('GitHub fetch uses authenticated repository ruleset list and detail endpoints', async () => {
  const fixture = githubFixtureFetch();
  const result = await verifyServerReleaseTagProtection({
    repository: REPOSITORY,
    tag: TAG,
    token: 'github-token',
    fetchImpl: fixture.fetchImpl
  });

  assert.equal(result.rulesets.creation.id, 21);
  assert.equal(fixture.calls.length, 3);
  assert.equal(
    fixture.calls[0].url,
    'https://api.github.com/repos/MChartier/calibrate-health/rulesets?includes_parents=true&targets=tag&per_page=100'
  );
  assert.match(fixture.calls[1].url, /\/rulesets\/2[12]\?includes_parents=true$/);
  assert.match(fixture.calls[2].url, /\/rulesets\/2[12]\?includes_parents=true$/);
  for (const { init } of fixture.calls) {
    assert.equal(init.method, 'GET');
    assert.equal(init.headers.Authorization, 'Bearer github-token');
    assert.equal(init.headers.Accept, 'application/vnd.github+json');
    assert.equal(init.headers['X-GitHub-Api-Version'], '2022-11-28');
  }
});

test('GitHub fetch rejects non-2xx and malformed responses', async () => {
  const nonSuccess = githubFixtureFetch({
    listResponse: jsonResponse({ message: 'no' }, { status: 403 })
  });
  await assert.rejects(
    fetchServerReleaseTagRulesets({
      repository: REPOSITORY,
      token: 'token',
      fetchImpl: nonSuccess.fetchImpl
    }),
    /listing failed with HTTP 403/
  );

  const malformedList = githubFixtureFetch({ listResponse: jsonResponse({ rulesets: [] }) });
  await assert.rejects(
    fetchServerReleaseTagRulesets({
      repository: REPOSITORY,
      token: 'token',
      fetchImpl: malformedList.fetchImpl
    }),
    /listing is malformed/
  );

  await assert.rejects(
    fetchServerReleaseTagRulesets({
      repository: REPOSITORY,
      token: 'token',
      fetchImpl: async () => ({ status: 200, json: async () => [] })
    }),
    /listing returned a malformed response/
  );

  const malformedJson = githubFixtureFetch({
    listResponse: jsonResponse(null, { raw: '{', status: 200 })
  });
  await assert.rejects(
    fetchServerReleaseTagRulesets({
      repository: REPOSITORY,
      token: 'token',
      fetchImpl: malformedJson.fetchImpl
    }),
    /listing returned malformed JSON/
  );

  const detailFailure = githubFixtureFetch({
    detailResponse: () => jsonResponse({ message: 'no' }, { status: 500 })
  });
  await assert.rejects(
    fetchServerReleaseTagRulesets({
      repository: REPOSITORY,
      token: 'token',
      fetchImpl: detailFailure.fetchImpl
    }),
    /GitHub ruleset server-release-tag-(?:creation|immutability) failed with HTTP 500/
  );

  const mismatchedDetail = githubFixtureFetch({
    detailResponse: (id) => jsonResponse({
      ...validRulesets().find((candidate) => candidate.id === id),
      id: 99
    })
  });
  await assert.rejects(
    fetchServerReleaseTagRulesets({
      repository: REPOSITORY,
      token: 'token',
      fetchImpl: mismatchedDetail.fetchImpl
    }),
    /detail does not match its listing/
  );
});

test('GitHub fetch fails rather than partially verifying more than 100 rulesets', async () => {
  const nextPage = githubFixtureFetch({
    listResponse: jsonResponse([], {
      headers: { Link: '<https://api.github.com/repositories/1/rulesets?page=2>; rel="next"' }
    })
  });
  await assert.rejects(
    fetchServerReleaseTagRulesets({
      repository: REPOSITORY,
      token: 'token',
      fetchImpl: nextPage.fetchImpl
    }),
    /more than 100 rulesets/
  );

  const tooMany = Array.from({ length: 101 }, (_, index) => ({
    id: index + 1,
    name: `ruleset-${index}`
  }));
  const oversized = githubFixtureFetch({ summaries: tooMany });
  await assert.rejects(
    fetchServerReleaseTagRulesets({
      repository: REPOSITORY,
      token: 'token',
      fetchImpl: oversized.fetchImpl
    }),
    /more than 100 rulesets/
  );
  assert.throws(
    () => validateServerReleaseTagProtection(
      Array.from({ length: 101 }, (_, index) => ruleset(index + 1, `ruleset-${index}`, ['creation'])),
      { tag: TAG }
    ),
    /more than 100 rulesets/
  );
});

test('GitHub fetch rejects duplicate summaries and detail-listing mismatches', async () => {
  const duplicateIds = githubFixtureFetch({
    summaries: [
      { id: 21, name: 'server-release-tag-creation' },
      { id: 21, name: 'server-release-tag-immutability' }
    ]
  });
  await assert.rejects(
    fetchServerReleaseTagRulesets({
      repository: REPOSITORY,
      token: 'token',
      fetchImpl: duplicateIds.fetchImpl
    }),
    /summary id 21 is duplicated/
  );

  const duplicateNames = githubFixtureFetch({
    summaries: [
      { id: 21, name: 'server-release-tag-creation' },
      { id: 23, name: 'server-release-tag-creation' },
      { id: 22, name: 'server-release-tag-immutability' }
    ]
  });
  await assert.rejects(
    fetchServerReleaseTagRulesets({
      repository: REPOSITORY,
      token: 'token',
      fetchImpl: duplicateNames.fetchImpl
    }),
    /server-release-tag-creation is ambiguous/
  );
});

test('GitHub fetch validates repository and token before making requests', async () => {
  const fixture = githubFixtureFetch();
  await assert.rejects(
    fetchServerReleaseTagRulesets({
      repository: 'not-a-repository',
      token: 'token',
      fetchImpl: fixture.fetchImpl
    }),
    /OWNER\/REPO/
  );
  await assert.rejects(
    fetchServerReleaseTagRulesets({
      repository: REPOSITORY,
      token: '',
      fetchImpl: fixture.fetchImpl
    }),
    /GITHUB_TOKEN is required/
  );
  assert.equal(fixture.calls.length, 0);
});

test('CLI verifies the requested repository and tag using GITHUB_TOKEN', async () => {
  const fixture = githubFixtureFetch();
  let output = '';
  const result = await runServerReleaseTagProtectionCli({
    args: ['verify', '--repository', REPOSITORY, '--tag', TAG],
    env: { GITHUB_TOKEN: 'cli-token' },
    fetchImpl: fixture.fetchImpl,
    stdout: { write: (value) => { output += value; } }
  });

  assert.equal(result.tag, TAG);
  assert.equal(
    output,
    `Visible server release tag ruleset shape verified for ${REPOSITORY} ${TAG}.\n`
  );
  assert.equal(fixture.calls[0].init.headers.Authorization, 'Bearer cli-token');
});
