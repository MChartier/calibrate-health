# ADR 0007: Support a portable single-application self-hosting topology

- Status: Accepted
- Date: 2026-07-12

## Context

Calibrate is a multi-user self-hosted service, but its supported deployment files currently run one application
container. The application owns an in-process reminder scheduler and process-local notification SSE fanout. Startup
also applies Prisma migrations before the HTTP server becomes ready. Those responsibilities have no distributed
lease, leader election, or shared pub/sub coordination.

The deployment must work without AWS-specific infrastructure and must allow operators to use either their own
Postgres and proxy or the repository's Compose building blocks.

## Decision

Support exactly one application process per Calibrate instance. Provide Caddy and existing-Traefik Compose variants,
with either external Postgres or the optional in-stack Postgres overlay. Keep Postgres as the canonical durable store,
run forward migrations before serving traffic, and expose separate process-liveness and database-readiness probes.
Encrypted backup tooling is optional when another tested backup system owns durability.

Do not include Terraform, cloud-provider resources, a bundled container orchestrator, or horizontal application
scaling in the supported boundary. External food providers and notification delivery remain optional capabilities;
the core service must run with native push disabled.

## Consequences

- One deployment can serve multiple user accounts, but it cannot run multiple application replicas safely as a
  supported configuration.
- Operators can choose Caddy or integrate with an existing Traefik network and can keep Postgres outside Compose.
- Process restart temporarily interrupts SSE and scheduled jobs; clients rely on canonical database state and fallback
  refresh behavior.
- High availability requires a new decision covering shared pub/sub, job ownership, migration coordination, and
  multi-replica validation before replicas are added.
- Disaster recovery is database backup and clean restore, not cloud-provider infrastructure reconstruction.
