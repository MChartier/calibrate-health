# Hosted mobile app links

## Android App Links

The production Android application declares verified HTTPS links for `calibratehealth.app`. The
hosted web deployment must publish this static document without authentication:

`GET https://calibratehealth.app/.well-known/assetlinks.json`

Endpoint requirements:

- Return HTTP 200 with `Content-Type: application/json`.
- Do not redirect to another host or require a cookie.
- Serve the document over a valid public HTTPS certificate.
- Use the Android package `app.calibratehealth.mobile`.
- Include every currently accepted production signing certificate fingerprint and remove retired
  certificates only after affected app versions are outside support.

The document shape is:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "app.calibratehealth.mobile",
      "sha256_cert_fingerprints": [
        "REPLACE_WITH_PRODUCTION_CERTIFICATE_SHA256"
      ]
    }
  }
]
```

Derive the fingerprint from the same signed artifact and certificate used for the release candidate.
Do not copy a debug or upload-key fingerprint unless that certificate signs the installed production
APK. Record the final hosted response, package, signing fingerprint, app version, and release commit
in the Android release evidence.

Verification and reset URLs must use paths registered by the client route registry and the same
`PUBLIC_APP_ORIGIN`. Validate both a browser fallback and an Android App Link against the deployed
candidate before launch.

## iOS Universal Links

The production iOS configuration declares `applinks:calibratehealth.app`. The hosted web deployment must also
publish the Apple association document without authentication, a redirect, or a filename extension:

`GET https://calibratehealth.app/.well-known/apple-app-site-association`

Return HTTP 200 with `Content-Type: application/json` over public HTTPS. The AASA `appIDs` entry must be
`<APPLE_TEAM_ID>.app.calibratehealth.mobile`; derive the Team ID from the production signing team rather than
committing a placeholder. Associate only client route-registry paths that have a browser fallback, and validate
both the fallback and an installed iPhone/iPad Universal Link before launch.

Self-hosted domains are not associated with the official mobile apps automatically.
