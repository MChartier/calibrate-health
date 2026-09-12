# Manual self-hosted upgrades

Cut the server release in GitHub Actions, then upgrade the existing Docker Compose stack on its host.
Use [the deployment guide](../README.md) for initial setup, backup configuration, proxy variants,
and database recovery. No deployment runner, SSH automation account, or local deployment script is required.

1. Confirm a recent encrypted database backup and retain the currently deployed image reference.
2. Set `APP_IMAGE` in the host's deployment `.env` to the published version tag or immutable digest.
3. From the existing Compose directory, use the same Compose files and project name as initial setup:

   ```sh
   docker compose pull app
   docker compose up -d app
   docker compose ps app
   ```

   Include the existing `-f` selections if the installation uses proxy/database overlays.
4. Verify `/api/v1/readyz`, the served app, and the version in `/api/v1/client-config`.
5. Publish native/OTA changes only after the deployed server satisfies their `requiresServer` range.

Startup applies forward-only database migrations. A failed upgrade may require restoring the
pre-upgrade backup into a clean database and running the matching prior image; changing the image
alone does not reverse a migration. Keep the previous backup until the upgrade is verified.

Client publishing is documented in [the local release runbook](../../docs/local-release.md).
Those commands print the server requirement and leave rollout ordering to the maintainer.
