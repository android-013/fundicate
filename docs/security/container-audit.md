# Standalone container audit — 8–9 November 2026

This is an assessment of Fundicate's local Linux container artifacts. It does not certify a host, public deployment or every use of their installed libraries. No image was pushed and no hosted service was published. The 7 November observations are retained below as historical results; their image IDs and counts are not substituted for the later rebuilt artifacts.

## Current artifacts and public evidence

The user approved installing Docker Engine in the existing Ubuntu WSL environment for local verification. Docker Engine 29.9.3, containerd 2.4.2, runc 1.5.2 and Compose 5.7.0 were installed from Docker's signed Ubuntu repository. Its expected signing-key fingerprint was checked. The daemon uses its local Unix socket; no public Docker TCP endpoint was configured. This changes the earlier preflight finding that Docker was unavailable. No Docker Desktop or Windows Hyper-V configuration was changed.

Trivy 0.76.2's official Linux archive matched the published checksum `bc0fc726e017b8927a62b2d3531d7a84ee01769daf5c99ed866dced54089fdbf`. The current scanner observations include all severities. Its recorded vulnerability database was updated at `2026-11-08T12:51:20.684876801Z` and downloaded at `2026-11-08T17:21:00.882112461Z`; `trivy-version.json` preserves the metadata. The coordinator reports no advisory suppressions or `--ignore-unfixed`; the final public command receipt must preserve the actual invocation and flags.

| Artifact | Exact rebuilt image ID | Current observation |
| --- | --- | --- |
| Repackaged standalone web runtime | `sha256:acca5808327d28f5b4e5d6eb4f45a43772455e87cf4d9e4e7f6b66bdedd207e1` | Trivy scan at `2026-11-09T09:01:40.850962813+06:00`: zero reported vulnerabilities at every severity. This precedes the payment-clock repair. |
| PostgreSQL 18 / Bookworm | `sha256:ea816ac5ef27d3e72a3b80352387b363e7348600ffd5302aca9f2a1d198b0818` | Trivy scan at `2026-11-09T07:55:08.306887858+06:00`: 4 Critical, 75 High, 203 Medium, 174 Low and 1 Unknown package observations. |
| Repackaged operator tools | `sha256:ce69d53eba3e106954a63f0100a511185519fcebb4f3734f970fe1b6872adbb5` | Trivy scan at `2026-11-09T09:01:41.880443264+06:00`: zero reported vulnerabilities at every severity. Prisma migrations and doctor execute in the partial Compose fixture; full functional acceptance remains pending. |

Public evidence is under `.local/container-audit-20261108/`. `public-evidence-index-20261109T022058Z.json` records the initial copied public files; `public-evidence-index-20261109T024110Z.json` adds exact database package/linkage/symbol evidence, the initial tools scan and scanner database metadata. The latest reviewed index, `public-evidence-index-20261109T065204Z.json`, includes 46 files and the actual failed Compose smoke's partial observations. The assessment agent independently checked all 46 lengths/hashes. These copies exclude generated database env files and browser fixture credentials. Raw scans, build logs, exact shipped `gosu`, release signature and complete symbol-analysis log remain intact. Later indices may preserve changed artifacts under hash-suffixed filenames with `sourceFile` mappings; consult the index instead of assuming a generic filename is the latest artifact. An index does not imply that still-pending Compose/restore actions passed. Runtime/tools must be rebuilt and their evidence renewed after the payment-clock source repair.

The earlier tools image `sha256:d0cda5dcb35fab29154f2a6788df37149d2411449c97fc5fdadc982d9dd448ec` reported `glob` 13.0.6 (`CVE-2026-118773`) and `minimatch` 10.2.5 (`CVE-2026-118764`) under global npm, plus unmaintained `wee_alloc` 0.4.5 (`GHSA-rc23-xxgq-x27g`) in dormant `app/contracts/near-treasury/Cargo.lock`. The repackaged operator image copies the supported operations payload and removes global package managers; its fresh full scan above reports zero records. The repository's dormant contract history is preserved. The partial fixture proves Prisma migration execution and doctor startup, while the complete repaired maintenance/backup/restore path still needs its final functional proof.

## Database patching and the shipped privilege helper

`Dockerfile.database` preserves PostgreSQL major 18, Debian Bookworm/glibc, the official initialization/privilege-drop entrypoint, PGDATA and `/var/lib/postgresql` volume layout. Refreshing the signed Bookworm/PGDG repositories completed and `apt-get upgrade` reported **zero available upgrades**. The resulting PostgreSQL reports 18.6, Debian package `18.6-1.pgdg12+2`. This is a checked supported-package state, not evidence that all package advisories are fixed.

The unmanaged `gosu` helper required a separate change: official release 1.20 replaces 1.19. Its signature was checked against publisher fingerprint `B42F6819007F00F88E364FD4036A9C25BF357DD4`; the exact shipped Linux/amd64 binary hashes to `b1892636c281590f34bc63c1118f058cd9de66c4ea463772e3909672d8b302ac`. Its unprivileged execution check passed. This updates its `github.com/moby/sys/user` dependency and removes the corresponding previously observed Medium issue. The binary still reports Go 1.24.6, so changing its version is not described as patching that entire Go standard library. See the [official gosu release](https://github.com/tianon/gosu/releases/tag/1.20).

Official Govulncheck 1.9.0 in binary mode, using `https://vuln.go.dev`, examined that exact hash and exited zero: **0 affected-symbol findings, 3 imported-package matches and 55 required-module matches**. All 58 advisory IDs appear in the retained log. This is evidence about linked affected symbols in this particular executable; its 60 package/module observations remain in Trivy's inventory. The other two Go observations are explicitly Windows-only: [GO-2026-5024](https://pkg.go.dev/vuln/GO-2026-5024) covers `golang.org/x/sys/windows.NewNTUnicodeString`, and [GO-2026-6604](https://pkg.go.dev/vuln/GO-2026-6604) covers Windows junction handling. Their affected platform is absent from this Linux binary. The [Go tool's documented binary-analysis scope](https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck) applies; no universal claim about old Go binaries is made.

## Remaining database observations and application paths

The 457 raw observations consist of 397 Debian-package records and 60 Go-binary records. Of the 79 High/Critical records, 53 are Debian-package records and 26 are Go metadata records. Counts repeat source advisories across installed binary packages and must not be read as 457 independent vulnerabilities or demonstrated exploits.

The complete per-observation assessment is `database-assessment-agent.json`, bound to the exact database image and scan hash. It preserves scanner severity, installed/fixed versions, vendor state, advisory IDs and an explicit disposition. The current assessment retains 49 High/Critical OS package observations as conditional/open; 58 Go matches have exact-binary symbol evidence, two are Windows-only, one has Debian's specific MiniZip binary explanation, and three match affected components absent from the installed binary packages. The 344 lower-severity OS observations remain explicitly inventoried without an individual safe verdict. Vendor postponement, private networking and the absence of a known exploit are not patches or blanket waivers.

`database-binary-inventory.json` binds package queries and `ldd` output to the exact database image without attaching application data. The server links libxml2, LDAP and zlib. Its dynamic imports include `xmlCtxtReadDoc`, `xmlCtxtReadMemory`, `xmlSaveDoc` and `xmlXPathCompiledEval`; XML support is active code, not merely an unused package name. Neither the server nor psql has SQLite in its recorded dynamic dependency graph. The installed SQLite payload is a shared library with documentation, but this evidence does not exclude all other utility callers. Explicit package queries and the complete installed-package list confirm that `python3-libxml2`, `systemd-homed`, `minizip` and `libminizip1` are absent.

| Critical scanner record | Specific assessment |
| --- | --- |
| `CVE-2025-68121`, Go TLS in gosu | Maps to the exact-binary Govulncheck log above, which found no affected symbols. The original Critical metadata match is retained. |
| `CVE-2023-45853`, `zlib1g` | [Debian explicitly states](https://security-tracker.debian.org/tracker/CVE-2023-45853) that the affected contributed MiniZip implementation is not built into Bookworm's `src:zlib` binary packages. This explanation covers this specific source/binary match, not other zlib issues. |
| `CVE-2025-7458`, SQLite | [Vendor description](https://security-tracker.debian.org/tracker/CVE-2025-7458) requires arbitrary SQLite SQL with a crafted expression list. Fundicate uses PostgreSQL and exposes no SQLite SQL interface. Neither postgres nor psql dynamically links SQLite in the exact image. The installed library is still vendor-vulnerable; other utility callers remain a conditional boundary. |
| `CVE-2026-6653`, libxml2 | [Debian lists the installed Bookworm version as vulnerable/postponed](https://security-tracker.debian.org/tracker/CVE-2026-6653). It concerns `xmlParseInternalSubset` and crafted XML/DTD handling. PostgreSQL supports XML; the package cannot be dismissed because Python bindings are absent. |

Fundicate's application source exposes bounded JSON actions, parameterized PostgreSQL operations and CSV reports; the inspected source contains no XML parsing, XML casts, XPath/XInclude, SQLite, LDAP or user-supplied archive execution endpoint. The JSON reader limits request size and rejects compressed request bodies. That narrows the implemented HTTP attack surface. It does not remove native libraries, prove that every SQL caller is safe, or certify a compromised application or an arbitrary direct database connection. PostgreSQL XML remains a native-library path for SQL credentials: the actual `fundicate_app` role successfully executes `XMLPARSE`, and `xml_in`, `xpath` and `query_to_xml` are executable. Exposing a general SQL console, allowing untrusted database tenants, adding XML processing, discovering SQL injection or changing the runtime role requires a fresh assessment.

PostgreSQL's [XML functions](https://www.postgresql.org/docs/18/functions-xml.html) and [XML implementation](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/xml.c) remain relevant to the libxml2 assessment. The affected functions must be considered individually:

| Advisory | Vendor-identified function/path | Current boundary |
| --- | --- | --- |
| [CVE-2026-6653](https://security-tracker.debian.org/tracker/CVE-2026-6653) | XML parser internal subset / DTD entity handling | Exact server linkage/imports and runtime-role XMLPARSE confirm active SQL/XML. No application route invokes it; no exclusion of the affected internal parser call graph is claimed. |
| [CVE-2026-86138](https://security-tracker.debian.org/tracker/CVE-2026-86138) | `xmlDictAddQString` integer overflow | Parser/dictionary implementation; not excluded by absent Python bindings. |
| [CVE-2026-86140](https://security-tracker.debian.org/tracker/CVE-2026-86140) | `xmlSnprintfElements` stack overflow | Element-model formatting/validation path; no blanket parser exclusion is asserted. |
| [CVE-2026-86142](https://security-tracker.debian.org/tracker/CVE-2026-86142) | `xmlXPtrEvalXPtrPart` length saturation | XPointer is distinct from PostgreSQL's XPath API; absence of direct app XPointer calls is a scoped mitigation, not binary removal. |
| [CVE-2026-86143](https://security-tracker.debian.org/tracker/CVE-2026-86143) | XML output callback length handling | XML serialization is supported by PostgreSQL; exact affected callback reachability is not yet established. |
| [CVE-2026-86144](https://security-tracker.debian.org/tracker/CVE-2026-86144) | XInclude flag propagation | No app XInclude feature exists; this is narrower than general XML parsing. |
| [CVE-2026-74860](https://security-tracker.debian.org/tracker/CVE-2026-74860) | Python SAX attribute declaration callback | The exact installed-package/payload evidence confirms no Python binding. This excludes only the identified Python callback component; it does not dispose of the six other XML records. |

Other High findings retain their specific preconditions: [util-linux restricted mounts](https://security-tracker.debian.org/tracker/CVE-2026-53613) require local mount authorization and attacker-controlled paths; [DOS partition parsing](https://security-tracker.debian.org/tracker/CVE-2026-53615) requires a crafted disk-image probe; [libacl](https://security-tracker.debian.org/tracker/CVE-2026-54369) requires privileged pathname ACL operations; [ncurses](https://security-tracker.debian.org/tracker/CVE-2025-69720) identifies the `infocmp` CLI in the installed `ncurses-bin`; [Perl](https://security-tracker.debian.org/tracker/CVE-2026-9538) identifies `Archive::Tar`; and [GNU gzip](https://security-tracker.debian.org/tracker/CVE-2026-41992) requires a crafted mixed-format decompression sequence. These are retained affected packages/utilities. [CVE-2026-16742](https://security-tracker.debian.org/tracker/CVE-2026-16742) specifically identifies `systemd-homed`, whose binary package is absent; the `libsystemd0`/`libudev1` source-package matches are preserved with that narrow component distinction.

Two zlib findings need care. `CVE-2026-76844` has an incorrect webpack-related title in the scanner record, but [Debian's actual description](https://security-tracker.debian.org/tracker/CVE-2026-76844) concerns stale input pointers in `gz_write` after a write failure. It is not dismissed by the absence of webpack. [CVE-2026-85091](https://security-tracker.debian.org/tracker/CVE-2026-85091) describes a newer nonblocking `gz_vacate` path yet still marks Bookworm's older version vulnerable; the version-range discrepancy stays explicit. The exact shipped libz exports `gzwrite`, `gzprintf`, `gzvprintf` and `gzclearerr`, so the gzip API family is present. PostgreSQL's [gzip archive implementation](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/bin/pg_dump/compress_gzip.c) uses core deflate/inflate for custom archives and also has other file paths using `gzwrite`; those abort on write errors. The supported inference is limited to the tested custom-format backup path, not every possible operator compression command.

## Functional evidence and release boundary

`53b916f288-smoke-result.json` is explicitly **failed** because the payment-record HTTP action returned 500. It must not be counted as a successful end-to-end run. Its observations before that failure are still useful: the canonical Compose file started in an isolated project using a private temporary override; migrations exited zero with 15 migrations; owner credentials were absent from web/maintenance; app UID 1000 and database UID 999 had zero effective capabilities; the database had no published host port, used an internal network and was not privileged. The observed runtime role was not superuser, could not create roles/databases/public-schema objects, could not modify the migration table and could not truncate the application table queried by the helper. Doctor returned `ok`. The coordinator is repairing the payment clock guard and will renew source-bound checks and final container proof.

Actual `pg_hba_file_rules` contained local/container-loopback `trust` and remote `scram-sha-256`, with no LDAP method. Local trust is an explicit host/container-access boundary; it is not described as authenticated access. The partial role receipt does not yet show inherited elevated-role memberships such as `pg_execute_server_program`, `pg_read_server_files` or `pg_write_server_files`. `NOSUPERUSER` alone is insufficient to claim server-program/file capabilities are denied, especially when provisioning an existing role. Final provisioning/doctor policy and fixture evidence must resolve this nuance before an unconditional DML-only claim.

The per-family contextual assessment below applies to the inspected standalone HTTP product and the observed private database fixture. All 49 vendor-affected material observations remain conditional, subject to the final repaired source/artifact and independent review. It is not an image-wide waiver or certification of a general SQL/utility service.

| Family / material package records | Current product-input assessment | Residual boundary / reassessment trigger |
| --- | --- | --- |
| util-linux / 24 | No HTTP shell, mount or partition-image probe interface. Observed processes are non-root with zero effective capabilities; DB is not privileged. | Local restricted mounts, crafted disk metadata, devices/host mounts and privileged/container configuration. Effective capability observation does not prove every future setuid/host path absent. |
| libacl / 1 | No arbitrary-path ACL operation is exposed to product users. | Privileged filesystem/ACL tools, upload/extraction features or changed host-volume policy. |
| GNU gzip / 1 | No user archive execution/decompression path; compressed request bodies are rejected. | Trusted operators processing untrusted mixed LZW/LZH inputs; new archive imports. |
| ncurses / 4 | Affected `infocmp` CLI is installed, but no user terminal-description/CLI interface exists. | New terminal features or operator use of untrusted terminfo data. |
| Perl Archive::Tar / 4 | Product does not run Perl/tar processing on request data. | Archive imports, PL/Perl/custom extensions or operator scripts accepting untrusted archives. |
| SQLite / 6 | No SQLite/FTS/session SQL or file interface; postgres/psql do not dynamically link SQLite. | Other installed utility callers, new SQLite importers/FDWs, arbitrary database files or SQL consoles. |
| LDAP / 1 | Linked LDAP support is not active in observed HBA: remote auth uses SCRAM and the app has no LDAP feature. | LDAP/directory integration, connection-service changes or exposing DB to untrusted peers. |
| Core libxml2 / 6 | No HTTP XML/arbitrary-SQL endpoint, but SQL/XML is active and available to runtime credentials. | Direct SQL, credential compromise/SQL injection, XML imports/exports, new extensions/tenants or role changes. Affected internal call paths are not proved absent. |
| zlib gzip-write / 2 | No product interface for native `gz*` file-write/recovery APIs; custom archive source uses core deflate/inflate. | Actual backup/restore remains pending; changed archive format, nonblocking/retry-after-write-failure code and the vendor range discrepancy require review. |

Full repaired HTTP/browser smoke, logical backup/restore and the historical-base-to-patched-image test using a newly created disposable fixture volume remain pending. A fresh-image logical restore is distinct from an in-place rollout of an existing user cluster. Neither test permits deleting a user's volume or silently changing PostgreSQL major, libc or collation behavior. The final functional result must include resolved image IDs and source/Compose hashes; the partial result does not yet embed an explicit image-ID binding.

At this assessment stage, the repackaged web/tools scans report zero records, the database inventory is **not** clean, and repaired final artifacts, full functional proof and independent review are still required. The deployment blocker must not be resolved solely from this prose or from `apt-get upgrade` completing. Remaining material paths need a supported fix, specific proof of exclusion, or a substantive final review of the supported product boundary consistent with the release acceptance contract.

## Historical observations — 7 November 2026

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

## Compatible database patch recipe — 8 November 2026

`Dockerfile.database` extends the exact previously inventoried Bookworm digest. It refreshes the existing signed Debian/PGDG repositories and upgrades installed packages, retaining PostgreSQL major 18, Debian Bookworm/glibc, the official entrypoint and `/var/lib/postgresql` volume. This avoids an implicit distribution or database-major migration. Package updates may still change collation library versions: compare collation versions, follow PostgreSQL's index-rebuild guidance where required, and verify a backup restore before switching an existing cluster. Do not run `compose down -v` or initialize over an existing data directory.

During the early 8 November preflight, Docker and Trivy were unavailable on the Windows PATH and no existing WSL container tools were found. That historical limitation was subsequently addressed by the user's explicit Docker-in-WSL authorization and the later builds/scans recorded at the top of this report. The commands below are the retained verification procedure; they do not independently establish a clean inventory or a compatibility pass.

On a host with Docker and a current vulnerability database, build and inspect all distributed targets without publishing them:

```text
docker build --pull --no-cache -f Dockerfile.database -t fundicate-database-audit:local .
docker build --pull --target runtime -t fundicate-standalone-audit:local .
docker build --pull --target tools -t fundicate-standalone-tools-audit:local .
docker image inspect fundicate-database-audit:local
docker run --rm --network none fundicate-database-audit:local postgres --version
docker run --rm --network none fundicate-database-audit:local sh -c 'cat /etc/os-release; dpkg-query -W; ldd --version'
trivy image --scanners vuln --format json --output database-trivy.json fundicate-database-audit:local
trivy image --scanners vuln --format json --output runtime-trivy.json fundicate-standalone-audit:local
trivy image --scanners vuln --format json --output tools-trivy.json fundicate-standalone-tools-audit:local
```

Capture exact image IDs/digests, scanner version/database date, package versions and complete findings. Do not use `--ignore-unfixed`, blanket suppressions or absence of scanner output as evidence of safety. Resolve fixable findings; assess remaining advisories against the shipped binary and active features, citing vendor evidence. For example, Debian's MiniZip explanation above applies to that specific contributed decoder and does not dispose of unrelated Critical/High findings. A package upgrade also does not automatically replace unmanaged statically linked helpers; include any remaining Go/helper metadata in the assessment.

Test in an isolated Compose project using a newly named volume and private database network. Run the migrations/runtime-role provisioning, readiness check, registration/community/payment-record browser smoke and application integrity suites. Restore an actual logical backup into a separate throwaway database in the patched image, compare the complete snapshot/ledger manifests, and check collations. Do not attach this exercise to the user's existing Compose volume. Only then pin the verified resulting database image digest for a public deployment and resolve the release blocker with the saved observations.

Primary compatibility references: [official PostgreSQL image instructions and existing-data behavior](https://hub.docker.com/_/postgres), [PostgreSQL collation version maintenance](https://www.postgresql.org/docs/18/sql-altercollation.html), and the [official Bookworm image source](https://github.com/docker-library/postgres/blob/master/18/bookworm/Dockerfile). These support the patch/verification procedure, not a claim that the unexecuted patched image is secure.
