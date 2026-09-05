import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RELEASE_PATTERN = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const REPOSITORY_PATTERN = /^ghcr\.io\/[a-z0-9][a-z0-9-]*\/calibratehealth$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
// Allow time for image pulls and startup migrations, with bounded individual Docker commands.
const DOCKER_TIMEOUT_MS = 10 * 60 * 1000;
const PROBE_SCRIPT = `
  const options = { cache: 'no-store', signal: AbortSignal.timeout(10000) };
  const base = 'http://127.0.0.1:3000/api/v1/';
  const ready = await fetch(base + 'readyz', options);
  if (!ready.ok) throw new Error('Server is not ready');
  const response = await fetch(base + 'client-config', options);
  if (!response.ok) throw new Error('Client config is unavailable');
  const config = await response.json();
  process.stdout.write(config.server_version);
`;

export function validateRequest(request, imageRepository) {
  if (!REPOSITORY_PATTERN.test(imageRepository)) throw new Error('Invalid configured image repository.');
  if (!request || typeof request.imageRef !== 'string' || typeof request.releaseTag !== 'string') {
    throw new Error('Supply imageRef and releaseTag.');
  }
  const [repository, digest, extra] = request.imageRef.split('@');
  if (repository !== imageRepository || !DIGEST_PATTERN.test(digest) || extra !== undefined) {
    throw new Error('Only a digest from the configured GHCR image repository is accepted.');
  }
  if (!RELEASE_PATTERN.test(request.releaseTag)) throw new Error('releaseTag must be vMAJOR.MINOR.PATCH.');
  return { imageRef: request.imageRef, releaseTag: request.releaseTag };
}

function compareReleases(left, right) {
  const a = RELEASE_PATTERN.exec(left).slice(1).map(BigInt);
  const b = RELEASE_PATTERN.exec(right).slice(1).map(BigInt);
  for (let index = 0; index < a.length; index++) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return 0;
}

function atomicWrite(filename, content) {
  const temporary = `${filename}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, content, { mode: 0o600, flag: 'wx', flush: true });
    fs.renameSync(temporary, filename);
    if (process.platform !== 'win32') {
      const directory = fs.openSync(path.dirname(filename), 'r');
      try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function dockerCommand(args, cwd) {
  try {
    return execFileSync('docker', args, {
      cwd, encoding: 'utf8', timeout: DOCKER_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    }).trim();
  } catch {
    // Compose diagnostics may include host secrets. Keep detailed logs on the host.
    throw new Error(`Docker ${args[0]} failed; inspect the stack locally with docker compose ps/logs.`);
  }
}

function validateConfig(config) {
  for (const key of ['projectDirectory', 'stateDirectory', 'backupMarker']) {
    if (typeof config[key] !== 'string' || !path.isAbsolute(config[key])) {
      throw new Error(`${key} must be an absolute host path.`);
    }
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(config.projectName)) throw new Error('Set the existing Compose projectName.');
  if (!Array.isArray(config.composeFiles) || config.composeFiles.length === 0) throw new Error('Set composeFiles.');
  for (const file of [...config.composeFiles, config.envFile]) {
    if (typeof file !== 'string' || !file || path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) {
      throw new Error('Compose and environment files must be paths inside projectDirectory.');
    }
    if (!fs.statSync(path.join(config.projectDirectory, file)).isFile()) throw new Error('Missing stack file.');
  }
  for (const key of ['backupMaxAgeSeconds', 'waitTimeoutSeconds']) {
    if (!Number.isSafeInteger(config[key]) || config[key] <= 0) throw new Error(`${key} must be a positive integer.`);
  }
  if (config.waitTimeoutSeconds > 480) throw new Error('waitTimeoutSeconds must not exceed 480.');
}

export function deploy(requestInput, config, { runDocker = dockerCommand, now = Date.now, log = console.log } = {}) {
  validateConfig(config);
  const request = validateRequest(requestInput, config.imageRepository);
  const stateFile = path.join(config.stateDirectory, 'state.json');
  const imageFile = path.join(config.stateDirectory, 'image.env');
  const docker = (args) => runDocker(args, config.projectDirectory);
  const base = ['compose', '--project-name', config.projectName, '--project-directory', config.projectDirectory,
    '--env-file', path.join(config.projectDirectory, config.envFile)];
  // An explicit override keeps host secrets untouched and makes later Compose invocations reproducible.
  const compose = (args) => docker([
    ...base, ...(fs.existsSync(imageFile) ? ['--env-file', imageFile] : []),
    ...config.composeFiles.flatMap((file) => ['-f', path.join(config.projectDirectory, file)]), ...args,
  ]);
  const container = () => {
    const id = compose(['ps', '--all', '--quiet', 'app']);
    if (!/^[a-f0-9]{12,64}$/.test(id)) throw new Error('Expected exactly one existing app container. Start the stack manually first.');
    return id;
  };
  const inspect = (id, format) => docker(['inspect', '--format', format, id]);
  const probe = (id) => docker(['exec', id, 'node', '--input-type=module', '-e', PROBE_SCRIPT]);
  const save = (state) => atomicWrite(stateFile, `${JSON.stringify(state, null, 2)}\n`);

  let state;
  if (fs.existsSync(stateFile)) {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (state.schemaVersion !== 1) throw new Error('Unknown deployment state schema.');
    validateRequest(state.current, config.imageRepository);
    if (state.pending) validateRequest(state.pending, config.imageRepository);
  } else {
    const id = container();
    const version = probe(id);
    const imageId = inspect(id, '{{.Image}}');
    const digests = JSON.parse(docker(['image', 'inspect', '--format', '{{json .RepoDigests}}', imageId]));
    const imageRef = digests?.find((ref) => ref.startsWith(`${config.imageRepository}@`));
    const current = validateRequest({ imageRef, releaseTag: `v${version}` }, config.imageRepository);
    state = { schemaVersion: 1, current, pending: null };
  }

  if (compareReleases(request.releaseTag, state.current.releaseTag) < 0) {
    throw new Error('Refusing an older release. Restore/recovery is a local operator operation.');
  }
  if (request.releaseTag === state.current.releaseTag && request.imageRef !== state.current.imageRef) {
    throw new Error('Refusing a changed digest for an already deployed release. Publish a new release.');
  }
  if (state.pending && (state.pending.imageRef !== request.imageRef || state.pending.releaseTag !== request.releaseTag)) {
    throw new Error('A previous deployment is incomplete. Retry its exact digest or recover locally before another release.');
  }

  // A failed recreate may have removed the old container. Pending retries must be able to create it again.
  const existingId = state.pending ? null : container();
  if (!state.pending) {
    const currentId = docker(['image', 'inspect', '--format', '{{.Id}}', state.current.imageRef]);
    if (inspect(existingId, '{{.Image}}') !== currentId || probe(existingId) !== state.current.releaseTag.slice(1)) {
      throw new Error('Running stack differs from deployment state. Reconcile local changes before deploying.');
    }
  }
  if (request.imageRef === state.current.imageRef && !state.pending) {
    if (request.releaseTag !== state.current.releaseTag) {
      throw new Error('Running server version does not match deployment state.');
    }
    if (inspect(existingId, '{{.State.Health.Status}}') !== 'healthy') throw new Error('Container health check failed.');
    atomicWrite(imageFile, `APP_IMAGE=${request.imageRef}\n`);
    save(state);
    log(`Already healthy at ${request.releaseTag} (${request.imageRef}).`);
    return;
  }

  const backupTime = Date.parse(fs.readFileSync(config.backupMarker, 'utf8').trim());
  const backupAge = now() - backupTime;
  if (!Number.isFinite(backupTime) || backupAge < 0 || backupAge > config.backupMaxAgeSeconds * 1000) {
    throw new Error('Backup is invalid or too old. Complete a backup before deploying.');
  }
  log(`Pulling ${request.releaseTag}: ${request.imageRef}`);
  docker(['pull', request.imageRef]);
  const targetId = docker(['image', 'inspect', '--format', '{{.Id}}', request.imageRef]);
  // Record uncertainty before changing Compose: failed startup can already have migrated the database.
  state.pending = request;
  save(state);
  atomicWrite(imageFile, `APP_IMAGE=${request.imageRef}\n`);
  try {
    let rendered;
    try {
      rendered = JSON.parse(compose(['config', '--format', 'json']));
    } catch {
      throw new Error('Unable to validate Compose configuration. Inspect it locally.');
    }
    if (rendered.services?.app?.image !== request.imageRef) {
      throw new Error('Compose app image must use the managed APP_IMAGE override.');
    }
    compose(['up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--wait',
      '--wait-timeout', String(config.waitTimeoutSeconds), 'app']);
    const id = container();
    if (inspect(id, '{{.Image}}') !== targetId) throw new Error('Compose started a different image.');
    if (inspect(id, '{{.State.Health.Status}}') !== 'healthy') throw new Error('Container health check failed.');
    if (probe(id) !== request.releaseTag.slice(1)) throw new Error('Server version does not match the requested release.');
    save({ schemaVersion: 1, previous: state.current, current: request, pending: null });
    log(`Deployed and verified ${request.releaseTag} (${request.imageRef}).`);
  } catch (error) {
    throw new Error(`${error.message} Deployment remains pending; no automatic image or database rollback was attempted.`);
  }
}

async function main() {
  if (process.getuid?.() !== 0) throw new Error('Run through the installed root-owned deployment wrapper.');
  if (process.argv.length !== 2) throw new Error('No command-line arguments are accepted.');
  let input = '';
  const inputTimeout = setTimeout(() => process.stdin.destroy(new Error('Deployment input timed out.')), 10000);
  try {
    for await (const chunk of process.stdin) {
      input += chunk;
      if (Buffer.byteLength(input) > 1024) throw new Error('Deployment request exceeds 1024 bytes.');
    }
  } finally {
    clearTimeout(inputTimeout);
  }
  const config = JSON.parse(fs.readFileSync('/etc/calibrate/deploy.json', 'utf8'));
  if (config.stateDirectory !== '/var/lib/calibrate-deploy') throw new Error('Use the state directory locked by the wrapper.');
  deploy(JSON.parse(input), config);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[deploy] ${error.message}`);
    process.exitCode = 1;
  });
}
