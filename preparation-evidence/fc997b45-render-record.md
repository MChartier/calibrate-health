# PR body rendering checkpoint

Owner: sole issue421 implementation task, evidence retained outside product diff.
Source: fc997b45558c7f3ca610e947e800c9424f43b5ce
Base: 4728d4f75b70e6440a9778a42cd2224a300db725
Date: 2026-10-05 UTC; host mchartier_zbook.

Both pages of the initial and CI-complete API-body renderings were opened and
visually inspected. Summary, five behavioral rows, non-UI explanation and all
limitations were legible. The full image preserves content across page slices.
This is Sharp/Pango rendering of the entire API-returned Markdown, not a browser
or the private GitHub UI. Actual GitHub-page inspection remained blocked by
browser sandbox initialization. No ACL/security setting was changed.

Each directory retains exact API body, renderer source, full image, page slices
and manifest binding source bytes and image hashes. Reproduction:
node render-pr.cjs PATH_TO_SHARP_MODULE pr423-api-body.md OUTPUT_DIRECTORY
Sharp version, dimensions and exact hashes are in each manifest. No application
UI changed; these document images are not application Before/After evidence.

CI-complete body records all applicable CI successful (729 backend tests, real
synthetic PostgreSQL populated upgrade, encrypted rollback/re-upgrade, builds,
typechecking, vulnerability scan). Configured final-head review is still running
at this checkpoint; no independent QA or readiness is claimed. Preserve this
receipt if later body edits require another rendering.
