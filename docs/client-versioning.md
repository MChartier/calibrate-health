# Client and server versions

Releases identify artifacts independently. Compatibility is an explicit dependency of the
JavaScript bundle; cutting a server release does not raise that dependency automatically.

| Value | Source | Meaning |
| --- | --- | --- |
| Server release | shared/release.json server.version | Published server/image version; Cut release owns its mirrors |
| Native app version | shared/release.json android | Store-visible phone/Wear version |
| Android version codes | shared/release.json android | Unique odd phone / even Wear upload identifiers |
| Expo runtimeVersion | mobile/app.config.js appVersion policy | Exact native runtime targeted by a bundle |
| Client server requirement | shared/client-release.json requiresServer | Server versions the running Expo bundle can use |
| OTA identity | Expo update/group IDs and Git commit | Exact published JavaScript/assets update |

## Server requirement

Use one explicit inclusive minimum and exclusive upper bound:

~~~json
{ "requiresServer": ">=0.36.0 <1.0.0" }
~~~

This deliberately defines the repository's 0.x compatibility policy without relying on caret
range conventions. Only stable server versions are admitted; build metadata does not affect
comparison. Minimum patches are significant. A requirement of >=2.4.1 <3.0.0 excludes 2.4.0,
prereleases, and 3.0.0; it includes stable 2.4.1 through later 2.x releases.

Change this file when the client starts depending on a new API or a server fix, or when an API
migration changes its supported upper bound. A server-only release leaves this file alone.
The existing startup, server-selection, and manual-recheck guard checks the running bundle's
requirement with uncached requests. Expo still owns update download and activation. Publishing
does not poll a deployment or wait for maintainer confirmation; deploy the required server first.

Server SemVer describes the public API and documented behavior: compatible fixes are patches,
compatible additions are minors, and incompatible changes are majors. Server release selection
remains manual. Version declarations cannot infer all behavioral incompatibilities.

## Native and OTA compatibility

Expo matches the platform and runtimeVersion exactly. An increasing Android build number is not
a compatibility range. The current appVersion policy makes native app version 0.2.6 correspond
to runtime 0.2.6, regardless of the server version or the Expo update ID.

Retain the native fingerprint check. Changed native dependencies/configuration, plugins, custom
modules, or Wear inputs require a new native baseline. Pure JavaScript changes and changes to
shared/client-release.json do not themselves change the runtime. Never rewrite a bundle's
runtime label to target a different native version.

An OTA does not bump the native app version or build numbers. Record its Expo identity and Git
commit. Clients on other runtimes retain their last compatible updates. To support an older
runtime with another fix, use source compatible with that runtime and publish a separate export.

| Change | Release action |
| --- | --- |
| JavaScript UI fix | Publish OTA with the existing runtime and server requirement |
| Client uses a newly introduced endpoint | Update requiresServer and publish OTA after deploying the server |
| New native module | Prepare/build/install a new native version, then publish OTA for its runtime |
| Server maintenance fix | Cut/deploy a server patch; leave unrelated client versions and requirements alone |

The scripts and local credential setup are described in [local-release.md](local-release.md).
