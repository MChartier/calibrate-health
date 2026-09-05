# Automatic deployment over WireGuard

An optional GitHub-hosted job deploys the verified published GHCR digest to one existing Linux AMD64 Compose stack.
It joins your existing WireGuard network, invokes a restricted SSH command, and exits. No registry polling,
public application endpoint, webhook receiver, or persistent GitHub runner is needed.

`Publish prepared release` starts deployment after `build_release_image`, alongside Expo OTA publication.
Deployment failure is visible in Actions but does not prevent the sibling OTA job from running or require its
production approval. An offline server must be retried explicitly; there is no background reconciliation.
Deployment also runs when an unavailable native baseline causes OTA to be skipped. The image publisher exposes
its immutable digest only after verifying the release receipt and registry aliases; recovered publication uses that
attested identity even if the new credential-free rebuild differs. Existing release requests, publication approvals,
attestations, and recovery handlers remain unchanged.
`Build Release Image` remains an image-only recovery action.

This choice follows GitHub's [WireGuard networking guidance](https://docs.github.com/en/actions/how-tos/manage-runners/github-hosted-runners/connect-to-a-private-network/connect-with-wireguard).
The repository is public, so a Docker-capable persistent runner on the application host would expose it to the
[self-hosted runner risks](https://docs.github.com/en/actions/reference/security/secure-use#hardening-for-self-hosted-runners).
The original [Watchtower project](https://github.com/containrrr/watchtower) is archived. The deployment job consumes
the verified registry digest, so another publication moving `latest` cannot change the requested artifact.

## Install on the server

The target needs Docker Engine, Compose v2 with `up --wait` and multiple `--env-file` support, OpenSSH, `sudo`,
`flock` (util-linux), and Node 22+ at `/usr/bin/node`. This is a Linux server workflow; the Node tests also run on
Windows. The stack must already be running a healthy published GHCR image with exactly one `app` container.
Initial provisioning, proxy/database upgrades, and changes to Compose or application configuration remain manual.

From a reviewed checkout on the server, install the scripts:

```sh
sudo install -d -o root -g root -m 0700 /etc/calibrate /etc/calibrate/registry /var/lib/calibrate-deploy
sudo install -o root -g root -m 0644 deploy/scripts/self-hosted-deploy.mjs /usr/local/lib/calibrate-deploy.mjs
sudo install -o root -g root -m 0755 deploy/self-hosted/calibrate-deploy /usr/local/sbin/calibrate-deploy
sudo install -o root -g root -m 0600 deploy/self-hosted/deploy.example.json /etc/calibrate/deploy.json
sudoedit /etc/calibrate/deploy.json
```

Set `projectName` to the **existing** name shown by `docker compose ls`, `projectDirectory` to the existing stack
directory, and `composeFiles` to the exact files you currently use. For Traefik, select `docker-compose.traefik.yml`;
for an external database, omit `docker-compose.postgres.yml`. File paths are relative to `projectDirectory`.
Keep `stateDirectory` at `/var/lib/calibrate-deploy`, which is also where the wrapper locks deployments.

Set `backupMarker` to the backup service's `.last-success` file. Its contents must be the UTC ISO timestamp of the
last successful backup. An external backup system can maintain an equivalent marker after completing a backup.
The example accepts a backup up to 48 hours old; adjust `backupMaxAgeSeconds` for your recovery point requirements.
No deployment proceeds with a missing, future, malformed, or stale marker. This checks backup freshness, not
restorability: retain the [backup and restore drills](../README.md#clean-instance-restore-drill). Deploying can lose
changes since that backup if recovery subsequently requires restoring it.

`waitTimeoutSeconds` defaults to 300 in the example (maximum 480). Allow time for startup migrations. Keep the
wrapper, script, config, selected Compose files, application `.env`, state directory, and their parent directories
owned by root and unwritable by the SSH account. The SSH account must not belong to the Docker group or have
other sudo privileges. The wrapper clears the inherited environment and uses fixed paths; the remote request
cannot supply Compose files, registry credentials, database settings, or shell commands.

Public GHCR images need no login. If the package is private, provision a read-only package credential locally:

```sh
sudo docker --config /etc/calibrate/registry login ghcr.io
```

Use a credential with only the package access necessary to pull this image. It stays on the server. Application
secrets also stay in the existing `.env`; they are never copied into GitHub or printed in deployment output.

## Restrict SSH access

Create a dedicated SSH account and a separate Ed25519 key for this job. For example on Debian/Ubuntu:

```sh
sudo useradd --create-home --shell /bin/sh calibrate-deploy
sudo install -d -o root -g root -m 0755 /etc/ssh/authorized_keys
sudoedit /etc/ssh/authorized_keys/calibrate-deploy
```

Place this **single line** in that root-owned authorized-keys file, replacing the example public key:

```text
restrict,command="sudo -n /usr/local/sbin/calibrate-deploy" ssh-ed25519 REPLACE_WITH_CI_PUBLIC_KEY calibrate-ci
```

Add a matching SSH server configuration in `/etc/ssh/sshd_config.d/calibrate-deploy.conf`:

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

Validate with `sudo sshd -t` and reload the SSH service using your distribution's service name. Ensure the account
can authenticate with its key under your distribution's account policy. Preserve your existing administrative SSH
session while testing this new account.

Use `sudo visudo -f /etc/sudoers.d/calibrate-deploy` to add:

```sudoers
calibrate-deploy ALL=(root) NOPASSWD: /usr/local/sbin/calibrate-deploy ""
```

The empty argument string permits only the wrapper with **no arguments**. SSH input is a bounded JSON request
containing `imageRef` and `releaseTag`; the host accepts only `ghcr.io/<configured-owner>/calibratehealth@sha256:...`
and a canonical `vMAJOR.MINOR.PATCH` version. `flock` serializes local and remote invocations and releases its lock
when the process exits. A digest from the configured image still runs application code with the app's privileges;
the publication credentials and release workflow remain trusted.

## Configure the WireGuard peer and GitHub environment

Create a dedicated CI peer in the existing WireGuard server, with its own keys and a unique IPv4 address. On that
server, assign only the CI peer's `/32` as its allowed source address. Restrict traffic from that peer with the
server/gateway firewall to **TCP port 22 on the deployment host only**, including forwarded traffic if the VPN
gateway and Docker host differ. Client `AllowedIPs` alone is not a server-side firewall.

The VPN endpoint must already be reachable from the internet on its UDP port (a fixed address or dynamic DNS is
fine). The job supports one IPv4 deployment target and routes only that target through the tunnel; DNS and GHCR
traffic retain their normal routes. The internal application domain does not need to resolve on the runner.

Create the GitHub environment **`self-hosted-testing`** and restrict its deployment branches to **`master`**.
For automatic execution after the manual release action, leave required reviewers and wait timers off for this
testing environment. This does not change Expo's production approval rules. Protect workflow changes on `master`
and never add the deployment secrets to a PR job.

Deployment tooling is pinned to the running workflow's exact commit. Immediately before credentials are exposed,
the shared release-authority verifier requires current protected `master` or its exact canonical Cut release
child/merge. A stale rerun fails closed: start a fresh manual deployment from `master` with the recorded image
digest and release tag. Manual recovery is an operator-authorized digest selection; use the verified publisher
output, not an unverified tag lookup. It does not rebuild or re-attest an arbitrary supplied image.

Set these environment variables:

| Variable | Value |
| --- | --- |
| `DEPLOY_HOST` | Docker host's reachable IPv4 address, such as `192.168.1.10` |
| `DEPLOY_SSH_USER` | `calibrate-deploy` |
| `DEPLOY_WG_ADDRESS` | CI peer's IPv4 address, such as `10.8.0.20` (no CIDR suffix) |
| `DEPLOY_WG_ENDPOINT` | Existing public VPN hostname/IPv4 and UDP port, such as `vpn.example.com:51820` |
| `DEPLOY_WG_PUBLIC_KEY` | Existing VPN server's WireGuard public key |

Set these environment secrets:

| Secret | Value |
| --- | --- |
| `DEPLOY_WG_PRIVATE_KEY` | Dedicated CI peer's WireGuard private key |
| `DEPLOY_SSH_PRIVATE_KEY` | Dedicated CI SSH private key, without a passphrase |
| `DEPLOY_SSH_KNOWN_HOSTS` | Verified known-hosts line for `DEPLOY_HOST`, such as `192.168.1.10 ssh-ed25519 AAAA...` |

Obtain the SSH host public key through a trusted administrative session and associate it with `DEPLOY_HOST`.
The job requires strict host-key checking; it never trusts an unverified `ssh-keyscan` result at deployment time.

Finally set the **repository variable** `SELF_HOSTED_DEPLOY_ENABLED=true`. This gate must be a repository variable,
because it is evaluated before the environment is loaded. Until enabled, all automatic and manual deployment
jobs are skipped and release publishing works as before. Do not reuse this CI peer for other concurrent workflows.

## Deploy and recover

Start with **Deploy self-hosted server** from `master`, supplying the currently running release tag and its GHCR
digest. On the first successful invocation, the host adopts the running image and version, creates deployment state,
and verifies it without restarting. Use this to validate routing, SSH, and configuration before cutting a new release.
Copy the `Verified release image` from the image publisher's Actions summary. This is the authoritative registry
manifest digest, not the credential-free build's local image/config ID.

Subsequent **Cut release** and **Publish prepared release** runs automatically deploy their published digest.
The host checks the current stack against its saved state, checks backup freshness, pulls the digest, saves a pending
deployment, and writes `/var/lib/calibrate-deploy/image.env`. It then recreates only `app` using Compose
`up --no-deps --no-build --pull never --wait`. It checks the actual container image ID, Docker health status,
DB-backed `/api/v1/readyz`, and `/api/v1/client-config.server_version` inside that container. These checks attest the
app, not the proxy, DNS, or browser path. Expect brief downtime for the single replica while migrations and startup run.

The saved image override must also be used for later administrative Compose operations. For example, with the
example Caddy/in-stack configuration:

```sh
sudo docker compose --project-name calibrate --project-directory /srv/calibrate/deploy \
  --env-file /srv/calibrate/deploy/.env --env-file /var/lib/calibrate-deploy/image.env \
  -f /srv/calibrate/deploy/docker-compose.yml \
  -f /srv/calibrate/deploy/docker-compose.postgres.yml \
  -f /srv/calibrate/deploy/docker-compose.backup.yml ps
```

Replace `ps` with `logs --tail 100 app` to diagnose locally. Avoid exporting `APP_IMAGE` in an administrative shell:
shell variables take precedence over environment files. The deployment wrapper clears that possibility.

On success, `state.json` records current and previous release identities and clears pending state. Repeating that
exact release is a health check with no pull or restart. Older versions and changing the digest of an already
deployed version are rejected; publish a new version for a rebuilt artifact. GitHub concurrency does not guarantee
release ordering, so the host also enforces numeric version ordering.

If the server is offline or pulling fails, rerun only the failed deployment job, or use **Deploy self-hosted server**
with the recorded `image_ref` and `release_tag`. There is no need to rebuild the image or republish OTA. A failure
after pending state is saved allows only that exact release/digest to retry. Later releases stop until the incomplete
deployment is resolved. A lost SSH connection can leave the remote outcome uncertain; the same retry rule applies.
The Actions run reports failure without uploading raw application/Compose logs, which can contain secrets.

There is **no automatic rollback**: startup may have applied forward-only migrations even when readiness failed.
Use the [documented database recovery procedure](../README.md#clean-instance-restore-drill) if retrying the exact
release cannot recover the app. For an intentional local recovery or manual upgrade, first disable the repository
gate and ensure no deployment is running. Reconcile the database, image, `image.env`, and `state.json` together under
the same `/var/lib/calibrate-deploy/deploy.lock`. Archive those two state files after recovery if you need the next
invocation to adopt the healthy restored stack again. Never clear pending state merely to bypass a failed migration.
Re-enable automatic deployment only after verifying the recovered stack and its backup.

The host never checks out code, rebuilds the image, prunes images, starts other services, or automatically updates
these installed scripts. Install reviewed script/config updates explicitly using the installation commands above.

## Validation

`npm run test:deploy` tests the actual deployment and runner functions with temporary host state and simulated
Docker/network commands, including failures, retries, stale releases, backup checks, secret preservation, and cleanup.
`node --test scripts/release-workflow-contract.test.mjs` verifies digest propagation, opt-in gating, the hosted-runner
boundary, and OTA independence. The existing Release Configuration PR job runs both suites. A real deployment
requires the one-time host/environment setup above; tests do not contact or modify your server.
