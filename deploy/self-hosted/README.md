# Automatic deployment over WireGuard

GitHub-hosted Actions connect to the existing Linux Compose host over WireGuard and run one restricted SSH
command. The server pulls the image already configured in Compose, upgrades only `app`, waits for its health
check, and returns success or failure. Keep the existing Compose files and `.env`, including:

```dotenv
APP_IMAGE=ghcr.io/mchartier/calibratehealth:latest
```

Both **Cut release** / **Publish prepared release** and the manual **Publish Expo OTA Update** action require a
successful deployment before any internal OTA publication. Production publication inherits that requirement and
still requires the existing `production` approval. Failed connections, pulls, startup, or health checks block OTA.
When the native baseline is unavailable, the release still deploys the server after publishing the image and skips
OTA. **Build Release Image** remains image-only.

The shared OTA workflow owns its deployment gate, so manual OTA publication cannot skip it. There is no optional
`SELF_HOSTED_DEPLOY_ENABLED` switch; configure the host and environment before running releases with this workflow.
The image publisher retains its existing release verification before updating `latest`. Deployment follows whatever
`latest` resolves to when pulled; it does not select or verify an exact release digest or version.

This uses GitHub's [WireGuard networking guidance](https://docs.github.com/en/actions/how-tos/manage-runners/github-hosted-runners/connect-to-a-private-network/connect-with-wireguard).
No persistent GitHub runner or publicly reachable application/SSH port is needed.

## Install on the server

The target needs Docker Engine, Compose v2 supporting `pull --policy always` and `up --wait`, OpenSSH, `sudo`, and
Node 22+ at `/usr/bin/node`. Provision the Compose stack, database, and proxy normally first. Keep the existing
`app` healthcheck: it checks the DB-backed `/api/v1/readyz` endpoint after startup migrations.

From a reviewed checkout on the server:

```sh
sudo install -d -o root -g root -m 0700 /etc/calibrate /etc/calibrate/registry
sudo install -o root -g root -m 0644 deploy/scripts/self-hosted-deploy.mjs /usr/local/lib/calibrate-deploy.mjs
sudo install -o root -g root -m 0755 deploy/self-hosted/calibrate-deploy /usr/local/sbin/calibrate-deploy
sudo install -o root -g root -m 0600 deploy/self-hosted/deploy.example.json /etc/calibrate/deploy.json
sudoedit /etc/calibrate/deploy.json
```

Set `projectName` to the **existing** name from `docker compose ls`, `projectDirectory` to the stack directory, and
`composeFiles` / `envFile` to the files used by your normal Compose commands. File paths are relative to that directory.
For Traefik, choose `docker-compose.traefik.yml`; for an external database, omit `docker-compose.postgres.yml`.
`waitTimeoutSeconds` is 300 in the example (maximum 480). No image, backup, or deployment-state settings are needed.

Keep the installed wrapper, script, config, selected Compose files, application `.env`, and their parent directories
owned by root and unwritable by the SSH account. The account must not belong to the Docker group or have other sudo
privileges. The wrapper clears its environment and accepts no arguments or input. The caller cannot supply a shell
command, image reference, Compose file, or database setting.

Public GHCR images need no login. For a private package, provision a read-only package credential on the host with
`sudo docker --config /etc/calibrate/registry login ghcr.io`. Application and registry credentials stay on the host.

When replacing the previous deployment helper, update both installed scripts. Preserve your actual Compose paths
when updating the configuration. Stop adding `/var/lib/calibrate-deploy/image.env` to administrative Compose commands
and ensure the normal `.env` selects `latest`. The new helper neither reads nor writes the old `image.env` or
`state.json`; those files can be archived locally. It does not use the old lock or backup marker.

## Restrict SSH access

Create a dedicated account and a separate Ed25519 key for CI. For example on Debian/Ubuntu:

```sh
sudo useradd --create-home --shell /bin/sh calibrate-deploy
sudo install -d -o root -g root -m 0755 /etc/ssh/authorized_keys
sudoedit /etc/ssh/authorized_keys/calibrate-deploy
```

Place this single line in the root-owned authorized-keys file, replacing the example public key:

```text
restrict,command="sudo -n /usr/local/sbin/calibrate-deploy" ssh-ed25519 REPLACE_WITH_CI_PUBLIC_KEY calibrate-ci
```

Add `/etc/ssh/sshd_config.d/calibrate-deploy.conf`:

```text
Match User calibrate-deploy
    AuthorizedKeysFile /etc/ssh/authorized_keys/calibrate-deploy
    AuthenticationMethods publickey
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    PermitTTY no
    AllowTcpForwarding no
    AllowAgentForwarding no
    X11Forwarding no
Match all
```

Validate with `sudo sshd -t`, then reload SSH using the distribution's service name. Keep your administrative SSH
session open while testing. Ensure the account can authenticate with its key under the distribution's account policy.

Use `sudo visudo -f /etc/sudoers.d/calibrate-deploy` to add:

```sudoers
calibrate-deploy ALL=(root) NOPASSWD: /usr/local/sbin/calibrate-deploy ""
```

The empty argument string permits only this wrapper with no arguments. SSH requests cannot change what it runs.

## Configure WireGuard and GitHub

Create a dedicated CI peer with its own key pair and unique IPv4 address. On the WireGuard server, allow only that
peer's `/32` source address. Restrict its traffic with the server/gateway firewall to **TCP port 22 on the deployment
host**, including forwarded traffic if the gateway and Docker host differ. Client `AllowedIPs` is not a firewall.

The WireGuard endpoint must be reachable from the internet on its UDP port. The runner routes only the deployment
host through the tunnel; it does not need the application's internal domain to resolve.

Create the GitHub environment **`self-hosted-testing`**. Under deployment branches and tags, choose **Selected branches
and tags**, allow the branch **`master`** only, and add no tag rules. Keep `master` protected. Leave reviewers and wait
timers off for this environment if deployment should run automatically; keep the existing `production` OTA approval.
Do not place deployment secrets at repository level or in PR jobs. Workflow changes merged to `master` remain trusted.

Set these **environment variables**:

| Variable | Value |
| --- | --- |
| `DEPLOY_HOST` | Docker host's reachable IPv4 address, e.g. `192.168.1.10` |
| `DEPLOY_SSH_USER` | `calibrate-deploy` |
| `DEPLOY_WG_ADDRESS` | Dedicated CI peer's IPv4 address, e.g. `10.8.0.20`, without CIDR suffix |
| `DEPLOY_WG_PUBLIC_KEY` | WireGuard server's public key |

Set these **environment secrets**:

| Secret | Value |
| --- | --- |
| `DEPLOY_WG_ENDPOINT` | Public VPN hostname/IPv4 and UDP port, e.g. `vpn.example.com:51820` |
| `DEPLOY_WG_PRIVATE_KEY` | Dedicated CI peer's WireGuard private key |
| `DEPLOY_SSH_PRIVATE_KEY` | Dedicated CI SSH private key without a passphrase |
| `DEPLOY_SSH_KNOWN_HOSTS` | Verified known-hosts line for `DEPLOY_HOST`, e.g. `192.168.1.10 ssh-ed25519 AAAA...` |

If upgrading the previous configuration, move `DEPLOY_WG_ENDPOINT` from an environment variable to an environment
secret. The other three secrets and four variables keep their names. `SELF_HOSTED_DEPLOY_ENABLED` is no longer used.
The existing repository `EXPO_TOKEN`, Expo `preview` settings, and GitHub `production` approval remain required for OTA.

Obtain the SSH host key through a trusted administrative session. The job pins that key; it never learns it with an
unverified `ssh-keyscan` during deployment. Reusable workflow callers explicitly forward the four secret names; their
values resolve in the deployment job's protected environment. See GitHub's
[environment secrets in reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows#using-inputs-and-secrets-in-a-reusable-workflow).
The job also checks current protected-master workflow authority before using deployment credentials.

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

For rollout, first run the host command above, then run **Deploy self-hosted server** from `master` with no inputs.
Both commands perform a real upgrade to `latest` and may briefly restart `app`. Once that succeeds, use **Cut release**
or the existing manual OTA workflow. Internal publication waits for deployment success; production follows internal
publication and its existing approval. No deployment credentials are exposed to Expo export/publisher steps.

If a pull, startup, health check, or connection fails, inspect the stack locally with your normal `docker compose ps`
and `docker compose logs --tail 100 app` commands. After fixing the cause, rerun failed Actions jobs or dispatch
**Deploy self-hosted server** again. A standalone deployment does not resume an older OTA run; rerun that failed OTA
run as well. Every deployment invocation pulls the current `latest` again. There is no automatic rollback because
startup may already have applied migrations; use the existing [recovery procedure](../README.md#clean-instance-restore-drill)
if needed. Avoid overlapping manual upgrades with an Actions deployment; GitHub keeps CI peer sessions serialized.

Install later script/configuration changes explicitly. The host does not check out source, rebuild, prune images,
or upgrade the proxy/database as part of this operation.

## Validation

`npm run test:deploy` exercises upgrades, failure propagation, affirmative health, configuration preservation,
WireGuard/SSH restrictions, and cleanup with mocked Docker/network commands. The release workflow contract tests
cover both OTA entrypoints, production approval ordering, environment-secret forwarding, and server-only releases.
These checks do not connect to the private server; complete the rollout checks above on the configured host.
