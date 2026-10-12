# Automatic deployment over WireGuard

GitHub-hosted Actions connect to the existing Linux Compose host over WireGuard and run one restricted SSH
command. The server pulls the image already configured in Compose, upgrades only `app`, waits for its health
check, and returns success or failure. Keep the existing Compose files and `.env`, including:

```dotenv
APP_IMAGE=ghcr.io/mchartier/calibratehealth:latest
```

The end-to-end **Cut release** / **Publish prepared release** flow publishes the image, deploys the server, and
requires application health before invoking OTA publication. Failed connections, pulls, startup, or health checks
block that release's OTA. Production publication still requires the existing `production` approval.
When the native baseline is unavailable, the release still deploys the server after publishing the image and skips
OTA. **Build Release Image** remains image-only.

**Deploy self-hosted server** independently tests or retries the server upgrade. **Publish Expo OTA Update** handles
only client publication, with no server deployment or deployment secrets. For a manual OTA, ensure the target server
is compatible separately. There is no optional `SELF_HOSTED_DEPLOY_ENABLED` switch in the end-to-end release flow;
configure the host and environment before running it.
The image publisher retains its existing release verification before updating `latest`. Deployment follows whatever
`latest` resolves to when pulled; it does not select or verify an exact release digest or version.

This uses GitHub's [WireGuard networking guidance](https://docs.github.com/en/actions/how-tos/manage-runners/github-hosted-runners/connect-to-a-private-network/connect-with-wireguard).
No persistent GitHub runner or publicly reachable application/SSH port is needed.

## Set up the Debian host

Run this single command from a reviewed checkout on the server to complete setup and print the GitHub values:

```sh
sudo node deploy/scripts/setup-self-hosted.mjs
```

The installer targets **Debian with WireGuard running directly on this host through `wg-quick@<interface>.service`**.
It requires an existing reachable WireGuard UDP endpoint, Docker Engine, Compose v2 supporting `pull --policy always`
and `up --wait`, and Node 22+ at `/usr/bin/node`. The Debian packages `openssh-server`, `sudo`, and `wireguard-tools`
must be installed. Container-managed VPNs and separate gateways need their manager's peer configuration;
the installer refuses an inactive local wg-quick service. It does not install or upgrade system packages.

The prompts collect the existing Compose directory, project name, file list, and environment file, then the existing
WireGuard interface, server tunnel IPv4, an unused CI peer IPv4, and public endpoint (`hostname:UDP-port`). Use the
project name shown by `docker compose ls` and the files used by your normal Compose command. For Traefik, select
`docker-compose.traefik.yml`; omit `docker-compose.postgres.yml` for an external database. Keep `app` on `latest` with
its DB-backed `/api/v1/readyz` healthcheck; setup verifies those settings before changing the host.

Setup describes each proposed change and asks **`Apply this change? [y/N]`** before applying it. Enter `y` or `yes`
to proceed. Any other answer stops before that change; earlier approved changes remain recorded. Rerun setup to
continue, or use uninstall below to undo them. An interactive terminal is required. Read-only checks and already
correct assets are reported without confirmation; there is no blanket approval flag.

The one command:

- Creates `calibrate-deploy`, generates dedicated SSH and WireGuard keys, and installs the deployment helper/config.
- Installs root-owned authorized keys, an SSH forced command, and a sudo rule allowing only the fixed wrapper without
  arguments. Password login, forwarding, user SSH startup scripts, tunnels, and PTYs are disabled for this account.
- Validates the effective SSH policy before reloading SSH and rejects Compose paths writable by the deployment account.
- Adds the CI peer with one `/32` address and its route, applying the peer without restarting the VPN.
- Saves the GitHub values, including the SSH host key read locally, in root-only `/etc/calibrate/github-environment.json`.
- Prints all four variables and four secrets after successful setup, with instructions for the master-only environment.

Existing peers, Compose files, and `.env` are preserved. Setup does not deploy the application. Keep an administrative
SSH session open during setup. Setup and uninstall leave existing firewall rules, firewall services, and WireGuard
service units/dependencies unchanged. They do not install a firewall service or restart WireGuard. Existing routing
and firewall policy must permit the CI peer to reach TCP 22 on the server's tunnel address and determine its other
network access. The restricted SSH account permits only the deployment command.

Run the same installer again to update installed helpers or repair missing configuration. It reuses
`/etc/calibrate/setup.json` and the root-only `ci-ssh-key` / `ci-wireguard.key` files in `/etc/calibrate`; it does not
rotate existing keys or add duplicate peers. An unchanged rerun does not rewrite files, recreate the account, reset
the route, or reload/restart services; it reports what is already correct and prints the GitHub values again.
To adjust Compose settings or the endpoint, edit `setup.json` and rerun.
Changing the installed interface, addresses, or keys requires an explicit administrator migration.

The root-only `/var/lib/calibrate-deployment-setup/state.json` records created assets and original contents/settings
for changes that setup approves. It supports resuming partial runs and undoing changes; keep it until uninstall is
complete. This record is used only for host setup/uninstall, not for CI deployment. Before overwriting an existing
file, setup retains its original contents for restoration. Imported keys and pre-existing accounts/peers remain yours.

If a deployment authorized-key file already exists from manual setup, import its matching unencrypted Ed25519 private
key as `/etc/calibrate/ci-ssh-key` (root-owned, mode 0600) before running the installer. It refuses to replace existing
SSH access with a newly generated key. Keep the account out of the Docker/sudo groups and do not grant additional sudo
permissions. Selected Compose files, `.env`, and their parent directories must remain unwritable by this account.

Public GHCR images need no login. A private package needs a host-local read-only credential supplied once with
`sudo docker --config /etc/calibrate/registry login ghcr.io`. If replacing the earlier deployment helper, stop adding
`/var/lib/calibrate-deploy/image.env` to administrative Compose commands; the normal `.env` must select `latest`.
The new helper ignores the old image override, state, lock, and backup-marker files.

## Copy the GitHub configuration

The setup command prints the values automatically after it succeeds. Copy each named value into GitHub from your
trusted administrative session. The output contains private CI keys; do not paste it into an issue, PR, or shared log.
The installer never needs a GitHub token. The optional `github-values` mode only reprints the saved values later.

Create the GitHub environment **`self-hosted-testing`**. Under deployment branches and tags, choose **Selected branches
and tags**, allow the branch **`master`** only, and add no tag rules. Keep `master` protected. Leave reviewers and wait
timers off for this environment if deployment should run automatically; keep the existing `production` OTA approval.
Do not place deployment secrets at repository level or in PR jobs. Workflow changes merged to `master` remain trusted.

Set these **environment variables**:

| Variable | Value |
| --- | --- |
| `DEPLOY_HOST` | Server's WireGuard IPv4 address, e.g. `10.8.0.1` |
| `DEPLOY_SSH_USER` | `calibrate-deploy` |
| `DEPLOY_WG_ADDRESS` | Dedicated CI peer's IPv4 address, e.g. `10.8.0.20`, without CIDR suffix |
| `DEPLOY_WG_PUBLIC_KEY` | WireGuard server's public key |

Set these **environment secrets**:

| Secret | Value |
| --- | --- |
| `DEPLOY_WG_ENDPOINT` | Public VPN hostname/IPv4 and UDP port, e.g. `vpn.example.com:51820` |
| `DEPLOY_WG_PRIVATE_KEY` | Dedicated CI peer's WireGuard private key |
| `DEPLOY_SSH_PRIVATE_KEY` | Dedicated CI SSH private key without a passphrase |
| `DEPLOY_SSH_KNOWN_HOSTS` | Installer-generated host-key line, e.g. `10.8.0.1 ssh-ed25519 AAAA...` |

If upgrading the previous configuration, move `DEPLOY_WG_ENDPOINT` from an environment variable to an environment
secret. The other three secrets and four variables keep their names. `SELF_HOSTED_DEPLOY_ENABLED` is no longer used.
The existing repository `EXPO_TOKEN`, Expo `preview` settings, and GitHub `production` approval remain required for OTA.

The job pins the host key collected by the installer; it never learns it with an unverified `ssh-keyscan` during
deployment. Only the end-to-end release callers forward the four secret names through the handler, release worker,
and deployment workflow; GitHub requires each reusable call to pass them even though their values resolve in the
deployment job's protected environment. The OTA-only workflow has no deployment parameters. See GitHub's
[environment secrets in reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows#using-inputs-and-secrets-in-a-reusable-workflow).
The job also checks current protected-master workflow authority before using deployment credentials.

## Uninstall server integration

From the same checkout, run:

```sh
sudo node deploy/scripts/uninstall-self-hosted.mjs
```

Uninstall reports and confirms each change with the same default-no prompt. It removes the CI peer/route,
SSH/sudo configuration, helper files, keys, and account/group **when setup created them**.
It restores prior file contents and account shell where setup modified existing assets. It removes
only empty directories created by setup; externally added files such as registry credentials are retained and reported.
The Compose stack, application/database, server host keys, and unrelated VPN peers are preserved. It does not deploy,
stop, or roll back the application, and does not uninstall system packages.

An interrupted uninstall can be rerun to finish; setup refuses to run until that uninstall is complete. A second
completed uninstall is a no-op. Files edited after setup are identified in their deletion/restoration prompts, so
you can decline before replacing those edits. Uninstall also handles wg-quick `SaveConfig` removing peer comments.
Run one setup or uninstall process at a time.

Installations made with an earlier script that did not record ownership are treated as pre-existing assets. Their
assets are not silently claimed or deleted. Without an installation record, uninstall reports that there is nothing
tracked to remove. Remove the deployment environment credentials in GitHub separately when retiring the integration;
these host scripts do not authenticate to GitHub. End-to-end releases still require a working deployment target.

## Upgrade, verify, and retry

The manual host command and automated SSH command are the same:

```sh
sudo /usr/local/sbin/calibrate-deploy
```

With your existing project/file arguments, it runs:

```sh
docker compose pull --policy always app
docker compose up -d --no-deps --no-build --pull never --wait --wait-timeout 300 app
```

It then requires exactly one `app` container with Docker health status `healthy`. There are no deployment locks,
backup prerequisites, image overrides, or deployment receipts. It leaves Compose and `.env` unchanged. Health confirms
the application's configured readiness check, not proxy/DNS/TLS availability or exact OTA/server version identity.

For rollout, run **Deploy self-hosted server** from `master` with no inputs after merge. This checks the entire
WireGuard/SSH/upgrade/health path and performs a real upgrade to `latest`, which may briefly restart `app`. The host
command above is also available for local troubleshooting. Once the Actions deployment succeeds, use **Cut release**
for the full image/deploy/OTA sequence. In that flow, internal publication waits for deployment success; production
follows internal publication and its existing approval. Manual **Publish Expo OTA Update** publishes only the client
and requires no deployment credentials or host setup.

If a pull, startup, health check, or connection fails, inspect the stack locally with your normal `docker compose ps`
and `docker compose logs --tail 100 app` commands. After fixing the cause, rerun failed Actions jobs or dispatch
**Deploy self-hosted server** again. A standalone deployment does not resume a blocked end-to-end release; rerun the
failed release jobs to continue to OTA. Every deployment invocation pulls the current `latest` again. There is no automatic rollback because
startup may already have applied migrations; use the existing [recovery procedure](../README.md#clean-instance-restore-drill)
if needed. Avoid overlapping manual upgrades with an Actions deployment; GitHub keeps CI peer sessions serialized.

Install later script/configuration changes explicitly. The host does not check out source, rebuild, prune images,
or upgrade the proxy/database as part of this operation.

## Validation

`npm run test:deploy` exercises unchanged reruns, per-change confirmation, interrupted setup/uninstall, restoration of
pre-existing assets, key preservation, prerequisite failures, SSH validation, peer conflicts, firewall/service preservation,
upgrades, affirmative health, and cleanup with mocked system/Docker/network commands.
The release workflow contract tests cover both OTA entrypoints, production approval ordering, environment-secret
forwarding, and server-only releases.
These checks do not connect to the private server; complete the rollout checks above on the configured host.
