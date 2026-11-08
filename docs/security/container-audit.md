# Standalone container audit — 7 November 2026

This is a project container assessment, not a penetration test or a claim that the host or deployed infrastructure is secure. The coordinator's source, HTTP, database, browser and secret-scan receipts are separate evidence. No image was pushed and no hosted service was deployed.

## Changes and observed builds

`Dockerfile` now uses patched Node.js 22.23.4 on the official Alpine image, pinned to the multi-platform index digest `sha256:0e1754758c2df4cfa3e68d59e2e1b7374bb7fd9ea6328eaaacf15cc934af8202`. OpenSSL is installed for Prisma's musl generation/migration engine. The dependency/operator stages pin npm 12.2.2 because the old bundled npm CLI had its own vulnerable dependency graph outside this project's lockfile. The web runtime removes global npm, corepack and Yarn from its merged filesystem; it retains its application dependencies and runs as `node`.

The local Linux runtime build completed successfully: Prisma 7.10.1 generation, TypeScript, the full Next.js 16.4.3 production build, all ten static pages, standalone assets and environment-file sanitization. It produced `fundicate-standalone-audit:local`, image ID `sha256:23a182f610ccd6f44de1c670dcbc3e1546d67490f6c930584cfac041c61ba4b2`. The operator target also completed these build steps and exported successfully as `fundicate-standalone-tools-audit:local`, image ID `sha256:f234c214e43241d9a3d8460e3f1cc444dee43bb0e73f2b26b3eb9006ca7c8382`.

Node's patched release is documented in the [official October 2026 security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases). The host's general OS and unrelated developer tools are outside this project assessment.

## Vulnerability observations

Trivy 0.76.2 was obtained from the official release and verified against its published SHA-256 checksum. Its vulnerability database was downloaded on 7 November 2026. Docker Scout could not run anonymously, so it was not counted as a successful scan.

Counts below are scanner **package findings**, not distinct CVEs or demonstrated exploits. The initial/base/database scans requested HIGH and CRITICAL only; their other severities were not measured. The final web scan included all severities.

| Inspected artifact | Critical | High | Medium | Observation |
| --- | ---: | ---: | ---: | --- |
| Original `node:22.22.2-bookworm-slim` | 7 | 60 | Not measured | Replaced; 32 package findings had listed fixes. |
| Official `node:22.23.4-alpine` before CLI removal | 0 | 10 | Not measured | All ten High findings were paths below global npm. |
| Built standalone web image above | 0 | 0 | 1 | No Low/Unknown findings; the one Medium match is retained and assessed below. |
| Compose `postgres:18-bookworm` | 4 | 75 | Not measured | Separate database-image inventory; not silently treated as clean. |

Raw scanner observations remain in ignored `.local/node-base-trivy.json`, `.local/node-alpine-trivy.json`, `.local/container-runtime-trivy.json` and `.local/postgres-compose-trivy.json`; they contain public package/advisory metadata. Commands used `trivy image --scanners vuln --format json --output ... IMAGE`, adding `--severity HIGH,CRITICAL` only for the initial/base/database comparisons. No advisory was suppressed.

## Retained web-image match: CVE-2026-4738

Trivy matches Alpine `zlib` 1.3.2-r1 to this Medium advisory and lists 1.4-r0 as fixed. Its description concerns GDAL's `contrib/infback9` Deflate64 decoder. The [upstream zlib ChangeLog](https://github.com/madler/zlib/blob/develop/ChangeLog) identifies that contributed decoder, while [GDAL's build configuration](https://github.com/OSGeo/gdal/blob/master/gdal.cmake) explicitly adds the separate `contrib/infback9` module for Deflate64.

The exact built image was inspected without hiding the finding:

- `apk info -L zlib` lists only `usr/lib/libz.so.1` and `usr/lib/libz.so.1.3.2`.
- A search under `/usr` and `/app` found no GDAL, `infback9` or `inftree9` component filenames.
- Binary inspection of the shipped libz found neither `inflateBack9` nor `inflate_table9`. The independent reviewer repeated the inspection with a positive core-inflate control, a read-only filesystem, no network and dropped capabilities.
- Node reports its separately bundled zlib as `1.3.1-e00f703`. This product accepts bounded JSON and does not offer archive/Deflate64 processing.

The supported inference is that the specific contributed decoder identified by this advisory is absent from the implemented runtime, not that every zlib vulnerability is harmless. The package-level Medium match remains in the inventory. Reassess it on base/dependency changes or before adding archive/geospatial/Deflate64 features; prefer an updated supported image when available. No blanket “zero vulnerabilities” claim is made.

## Database-image deployment limitation

The Compose database image resolved to `postgres@sha256:f1ea2a1a4fb7b68d4836be1fdcb8a6466a89b072158bf9d97663600538c294c5`. Its scan reported 75 High and four Critical package findings, 26 with listed fixes. They include OS libraries/utilities and Go standard-library metadata. This inventory does not prove each path is reachable through the application's parameterized SQL, but it requires deployment-specific triage and patch verification; the complete Compose stack must not be described as having a clean vulnerability scan.

One Critical source-level match, CVE-2023-45853 against Bookworm zlib, has specific [Debian tracker evidence](https://security-tracker.debian.org/tracker/CVE-2023-45853) that the affected contributed MiniZip code is not built into those binary packages. That explanation does not waive the other database findings.

The database distribution and existing volumes were preserved. Switching a persisted cluster from Debian/glibc to Alpine/musl can affect locale/collation compatibility and must not be used as an unreviewed workaround. Before public operation, patch and reassess a compatible database image or use a separately reviewed PostgreSQL deployment, preserving and testing backups/restores. Database ports remain private and the web service uses its separate DML runtime identity; these are controls, not substitutes for the outstanding image review.

## Operator image and isolated smoke evidence

Pending final operator-image scan and isolated container smoke. No successful observation is claimed for a step that has not executed. The coordinator is serializing this work with browser tests because the shared host is under memory pressure. Both image builds/exports are complete and no build process remains running.
