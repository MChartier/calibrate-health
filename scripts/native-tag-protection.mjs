import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const NATIVE_TAG_REF_PATTERN = 'refs/tags/native-v*';
export const NATIVE_TAG_RULESETS = Object.freeze({
  creation: Object.freeze({
    name: 'native-release-tag-creation',
    ruleTypes: Object.freeze(['creation'])
  }),
  immutability: Object.freeze({
    name: 'native-release-tag-immutability',
    ruleTypes: Object.freeze(['update', 'deletion'])
  })
});

const API_VERSION = '2022-11-28';
const MAX_RULESETS = 100;
const NATIVE_TAG_PATTERN = /^native-v\d+\.\d+\.\d+$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function requireNativeTag(tag) {
  if (typeof tag !== 'string' || !NATIVE_TAG_PATTERN.test(tag)) {
    throw new Error('Native tag protection requires --tag native-vMAJOR.MINOR.PATCH.');
  }
  return tag;
}

function parseRepository(repository) {
  if (typeof repository !== 'string' || !REPOSITORY_PATTERN.test(repository)) {
    throw new Error('Native tag protection requires --repository OWNER/REPO.');
  }
  const [owner, repo] = repository.split('/');
  if (owner === '.' || owner === '..' || repo === '.' || repo === '..') {
    throw new Error('Native tag protection requires --repository OWNER/REPO.');
  }
  return { owner, repo };
}

function requireRulesetObject(ruleset, label) {
  if (!ruleset || typeof ruleset !== 'object' || Array.isArray(ruleset)) {
    throw new Error(`${label} is malformed.`);
  }
  if (!Number.isSafeInteger(ruleset.id) || ruleset.id < 1) {
    throw new Error(`${label} has an invalid id.`);
  }
  if (typeof ruleset.name !== 'string' || ruleset.name.length === 0) {
    throw new Error(`${label} has an invalid name.`);
  }
}

function requireExactRefCondition(ruleset) {
  const refName = ruleset.conditions?.ref_name;
  if (!refName || typeof refName !== 'object' || Array.isArray(refName)) {
    throw new Error(`${ruleset.name} must define a ref_name condition.`);
  }
  if (
    !Array.isArray(refName.include) ||
    refName.include.length !== 1 ||
    refName.include[0] !== NATIVE_TAG_REF_PATTERN
  ) {
    throw new Error(`${ruleset.name} must include exactly ${NATIVE_TAG_REF_PATTERN}.`);
  }
  if (!Array.isArray(refName.exclude) || refName.exclude.length !== 0) {
    throw new Error(`${ruleset.name} must not exclude any native release tags.`);
  }
}

function requireRules(ruleset, expectedRuleTypes) {
  if (!Array.isArray(ruleset.rules)) {
    throw new Error(`${ruleset.name} has malformed rules.`);
  }
  const ruleTypes = new Set();
  for (const [index, rule] of ruleset.rules.entries()) {
    if (
      !rule ||
      typeof rule !== 'object' ||
      Array.isArray(rule) ||
      typeof rule.type !== 'string' ||
      rule.type.length === 0
    ) {
      throw new Error(`${ruleset.name} rule ${index + 1} is malformed.`);
    }
    ruleTypes.add(rule.type);
  }
  for (const ruleType of expectedRuleTypes) {
    if (!ruleTypes.has(ruleType)) {
      throw new Error(`${ruleset.name} must include the ${ruleType} rule.`);
    }
  }
  return [...ruleTypes].sort();
}

/**
 * Validate complete ruleset records returned by GitHub. This function is pure so
 * release policy can be tested without network access.
 */
export function validateNativeTagProtection(rulesets, options = {}) {
  const tag = requireNativeTag(options.tag);
  if (!Array.isArray(rulesets)) {
    throw new Error('GitHub ruleset details are malformed.');
  }
  if (rulesets.length > MAX_RULESETS) {
    throw new Error(`GitHub returned more than ${MAX_RULESETS} rulesets; refusing a partial verification.`);
  }

  for (const [index, ruleset] of rulesets.entries()) {
    requireRulesetObject(ruleset, `GitHub ruleset detail ${index + 1}`);
  }

  const verified = {};
  for (const [key, requirement] of Object.entries(NATIVE_TAG_RULESETS)) {
    const matches = rulesets.filter(({ name }) => name === requirement.name);
    if (matches.length === 0) {
      throw new Error(`Required active tag ruleset ${requirement.name} was not found.`);
    }
    if (matches.length !== 1) {
      throw new Error(`Required tag ruleset ${requirement.name} is ambiguous.`);
    }

    const ruleset = matches[0];
    if (ruleset.target !== 'tag') {
      throw new Error(`${requirement.name} must target tags.`);
    }
    if (ruleset.enforcement !== 'active') {
      throw new Error(`${requirement.name} must use active enforcement.`);
    }
    requireExactRefCondition(ruleset);
    const ruleTypes = requireRules(ruleset, requirement.ruleTypes);
    verified[key] = Object.freeze({ id: ruleset.id, name: ruleset.name, ruleTypes });
  }

  return Object.freeze({
    tag,
    refPattern: NATIVE_TAG_REF_PATTERN,
    rulesets: Object.freeze(verified)
  });
}

function hasNextPage(response) {
  const link = response.headers?.get?.('link');
  return typeof link === 'string' && /(?:^|,)\s*<[^>]+>;\s*rel="?next"?(?:\s*;|\s*(?:,|$))/i.test(link);
}

async function readJsonResponse(response, label) {
  if (
    !response ||
    typeof response !== 'object' ||
    !Number.isInteger(response.status) ||
    typeof response.headers?.get !== 'function'
  ) {
    throw new Error(`${label} returned a malformed response.`);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${label} failed with HTTP ${response.status}.`);
  }
  if (typeof response.json !== 'function') {
    throw new Error(`${label} returned a malformed response.`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned malformed JSON.`);
  }
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': API_VERSION
  };
}

/** Fetch the two required full ruleset records from GitHub's repository API. */
export async function fetchNativeTagRulesets(options = {}) {
  const { owner, repo } = parseRepository(options.repository);
  const token = typeof options.token === 'string' ? options.token.trim() : '';
  if (!token) throw new Error('GITHUB_TOKEN is required to verify native tag protection.');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');

  const apiRoot = (options.apiRoot ?? 'https://api.github.com').replace(/\/$/, '');
  const repositoryPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/rulesets`;
  const listUrl = `${apiRoot}${repositoryPath}?includes_parents=true&targets=tag&per_page=${MAX_RULESETS}`;
  const headers = githubHeaders(token);
  const listResponse = await fetchImpl(listUrl, { method: 'GET', headers });
  const summaries = await readJsonResponse(listResponse, 'GitHub ruleset listing');

  if (!Array.isArray(summaries)) throw new Error('GitHub ruleset listing is malformed.');
  if (summaries.length > MAX_RULESETS || hasNextPage(listResponse)) {
    throw new Error(`GitHub returned more than ${MAX_RULESETS} rulesets; refusing a partial verification.`);
  }

  const seenIds = new Set();
  for (const [index, summary] of summaries.entries()) {
    requireRulesetObject(summary, `GitHub ruleset summary ${index + 1}`);
    if (seenIds.has(summary.id)) throw new Error(`GitHub ruleset summary id ${summary.id} is duplicated.`);
    seenIds.add(summary.id);
  }

  const requiredSummaries = [];
  for (const { name } of Object.values(NATIVE_TAG_RULESETS)) {
    const matches = summaries.filter((summary) => summary.name === name);
    if (matches.length === 0) throw new Error(`Required active tag ruleset ${name} was not found.`);
    if (matches.length !== 1) throw new Error(`Required tag ruleset ${name} is ambiguous.`);
    requiredSummaries.push(matches[0]);
  }

  return Promise.all(requiredSummaries.map(async (summary) => {
    const detailUrl = `${apiRoot}${repositoryPath}/${summary.id}?includes_parents=true`;
    const response = await fetchImpl(detailUrl, { method: 'GET', headers });
    const detail = await readJsonResponse(response, `GitHub ruleset ${summary.name}`);
    requireRulesetObject(detail, `GitHub ruleset ${summary.name}`);
    if (detail.id !== summary.id || detail.name !== summary.name) {
      throw new Error(`GitHub ruleset ${summary.name} detail does not match its listing.`);
    }
    return detail;
  }));
}

export async function verifyNativeTagProtection(options = {}) {
  const tag = requireNativeTag(options.tag);
  const rulesets = await fetchNativeTagRulesets(options);
  return validateNativeTagProtection(rulesets, { tag });
}

function parseArguments(args) {
  const result = { command: args[0], repository: null, tag: null };
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--repository' || argument === '--tag') {
      const key = argument.slice(2);
      if (result[key] !== null) throw new Error(`Duplicate argument: ${argument}`);
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
      result[key] = value;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return result;
}

export async function runNativeTagProtectionCli(options = {}) {
  const config = parseArguments(options.args ?? process.argv.slice(2));
  if (config.command !== 'verify') throw new Error('Expected command: verify.');
  const repository = config.repository;
  const tag = config.tag;
  const result = await verifyNativeTagProtection({
    repository,
    tag,
    token: (options.env ?? process.env).GITHUB_TOKEN,
    fetchImpl: options.fetchImpl,
    apiRoot: options.apiRoot
  });
  const output = `Native tag protection verified for ${repository} ${tag}.\n`;
  (options.stdout ?? process.stdout).write(output);
  return result;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runNativeTagProtectionCli().catch((error) => {
    console.error(`[native-tag-protection] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
