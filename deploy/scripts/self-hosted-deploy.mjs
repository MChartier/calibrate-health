import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Allow time for image pulls and startup migrations, with bounded Docker commands.
const DOCKER_TIMEOUT_MS = 10 * 60 * 1000;

function dockerCommand(args, cwd) {
  try {
    return execFileSync('docker', args, {
      cwd, encoding: 'utf8', timeout: DOCKER_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    }).trim();
  } catch {
    // Compose diagnostics may include host secrets. Inspect detailed logs on the host.
    throw new Error(`Docker ${args[0]} failed; inspect the stack locally with docker compose ps/logs.`);
  }
}

function validateConfig(config) {
  if (typeof config.projectDirectory !== 'string' || !path.isAbsolute(config.projectDirectory)) {
    throw new Error('projectDirectory must be an absolute host path.');
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(config.projectName)) throw new Error('Set the existing Compose projectName.');
  if (!Array.isArray(config.composeFiles) || config.composeFiles.length === 0) throw new Error('Set composeFiles.');
  for (const file of [...config.composeFiles, config.envFile]) {
    if (typeof file !== 'string' || !file || path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) {
      throw new Error('Compose and environment files must be paths inside projectDirectory.');
    }
    if (!fs.statSync(path.join(config.projectDirectory, file)).isFile()) throw new Error('Missing stack file.');
  }
  if (!Number.isSafeInteger(config.waitTimeoutSeconds) || config.waitTimeoutSeconds <= 0 || config.waitTimeoutSeconds > 480) {
    throw new Error('waitTimeoutSeconds must be an integer from 1 to 480.');
  }
}

export function deploy(config, { runDocker = dockerCommand, log = console.log } = {}) {
  validateConfig(config);
  const docker = (args) => runDocker(args, config.projectDirectory);
  const compose = (args) => docker([
    'compose', '--project-name', config.projectName, '--project-directory', config.projectDirectory,
    '--env-file', path.join(config.projectDirectory, config.envFile),
    ...config.composeFiles.flatMap((file) => ['-f', path.join(config.projectDirectory, file)]), ...args,
  ]);

  log('Pulling the configured app image.');
  compose(['pull', '--policy', 'always', 'app']);
  log('Upgrading app and waiting for its health check.');
  compose(['up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--wait',
    '--wait-timeout', String(config.waitTimeoutSeconds), 'app']);

  const id = compose(['ps', '--all', '--quiet', 'app']);
  if (!/^[a-f0-9]{12,64}$/.test(id)) throw new Error('Expected exactly one app container after deployment.');
  // Compose --wait also accepts services without health checks; require affirmative application health.
  if (docker(['inspect', '--format', '{{.State.Health.Status}}', id]) !== 'healthy') {
    throw new Error('App health check did not succeed.');
  }
  log('Deployment and application health check succeeded.');
}

function main() {
  if (process.getuid?.() !== 0) throw new Error('Run through the installed root-owned deployment wrapper.');
  if (process.argv.length !== 2) throw new Error('No command-line arguments are accepted.');
  const config = JSON.parse(fs.readFileSync('/etc/calibrate/deploy.json', 'utf8'));
  deploy(config);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`[deploy] ${error.message}`);
    process.exitCode = 1;
  }
}
