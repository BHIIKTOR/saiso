# SAISO Plugin System Plan v1 (Revised Freeze Candidate)

## 1) Goal

1. Add a deterministic, compatibility-gated plugin system to SAISO CLI so integrations ship as plugins without expanding SAISO core runtime scope.

## 2) Scope (v1)

1. Plugin discovery, install/uninstall, enable/disable.
2. Manifest validation and compatibility gating.
3. Plugin command registration into SAISO CLI.
4. Plugin config validation and persistence.
5. Lockfile-authoritative deterministic resolution with source-specific integrity checks.
6. Plugin diagnostics and deterministic startup error reporting.

## 3) Out of Scope (v1)

1. Runtime hooks that mutate SAISO core execution internals.
2. Arbitrary lifecycle hooks beyond `registerCommands`, `init`, `doctor`.
3. Hard sandboxing/isolation enforcement.
4. Full signing/attestation PKI.
5. General plugin update workflow (moved to v1.1).

## 4) Contract Freeze Additions

### 4.1 Lockfile Versioning and Migration

1. Add `lockfileVersion` to `<project>/.saiso/plugins.lock.json`.
2. v1 host supports `lockfileVersion: 1`.
3. If lockfile version is newer than host support, startup returns deterministic error `PLUGIN_LOCKFILE_UNSUPPORTED_VERSION`.
4. If lockfile version is older but migratable, host auto-migrates by default and writes backup `plugins.lock.json.bak`.
5. If migration fails, return deterministic error `PLUGIN_LOCKFILE_MIGRATION_FAILED`.
6. Add CLI switch `--no-plugin-lockfile-migrate` to fail instead of auto-migrate.

### 4.2 Plugin ID Rules

1. Plugin `id` must match `^[a-z0-9][a-z0-9._/-]*$`.
2. IDs are lowercase-only by contract.
3. IDs are unique per project lockfile.
4. Duplicate IDs fail with `PLUGIN_ID_CONFLICT`.

### 4.3 Load Failure Policy

1. Default policy: skip broken enabled plugin, continue CLI startup, emit deterministic startup report.
2. Startup report is persisted at `<project>/.saiso/plugin-errors.json`.
3. Optional strict mode `SAISO_PLUGIN_STRICT_STARTUP=true` fails process on first enabled-plugin load error.
4. Broken plugin never partially registers commands.

### 4.4 Integrity Rules by Source Type

1. `npm` source lock entry must include `resolved` and `integrity` and both must match installed artifact.
2. `file` source lock entry must include canonical absolute path and `contentSha256`.
3. For file-directory sources, hash is computed from deterministic packed content ordering, not manifest only.
4. Any mismatch fails load with `PLUGIN_INTEGRITY_MISMATCH`.

#### 4.4.1 File-Directory Canonical Hash Algorithm (v1)

1. Hash algorithm is SHA-256 over a canonical manifest stream.
2. Directory walk is recursive from plugin root and includes only regular files.
3. Relative paths are normalized to POSIX separators (`/`) and sorted lexicographically by raw bytes.
4. Symlinks are not allowed in file-source plugin roots; detection fails install/load with `PLUGIN_SOURCE_POLICY_VIOLATION`.
5. For each file, canonical record is:
   1. normalized relative path
   2. `\\0`
   3. normalized mode token (`exec` when owner executable bit set, else `file`)
   4. `\\0`
   5. file size in bytes (base-10)
   6. `\\0`
   7. SHA-256 of raw file bytes (hex lowercase)
   8. `\\n`
6. Canonical hash input excludes mtime, uid, gid, xattrs, and platform-specific metadata.
7. Text encoding transformations are never applied; file bytes are hashed exactly as read.

### 4.5 Deterministic Error Code Set

1. `PLUGIN_MANIFEST_INVALID`
2. `PLUGIN_API_UNSUPPORTED`
3. `PLUGIN_RANGE_MISMATCH`
4. `PLUGIN_COLLISION`
5. `PLUGIN_INTEGRITY_MISMATCH`
6. `PLUGIN_NOT_ENABLED`
7. `PLUGIN_LOCKFILE_UNSUPPORTED_VERSION`
8. `PLUGIN_LOCKFILE_MIGRATION_FAILED`
9. `PLUGIN_ID_CONFLICT`
10. `PLUGIN_ENTRY_LOAD_FAILED`
11. `PLUGIN_CONFIG_INVALID`
12. `PLUGIN_CONFIG_SCHEMA_INVALID`
13. `PLUGIN_DOCTOR_FAILED`
14. `PLUGIN_ARTIFACT_NOT_FOUND`
15. `PLUGIN_SOURCE_POLICY_VIOLATION`
16. `PLUGIN_UNVERIFIED_SOURCE_REJECTED`
17. `PLUGIN_PROJECT_CONTEXT_REQUIRED`
18. `PLUGIN_LOCKFILE_INVALID_JSON`
19. `PLUGIN_CONFIG_FILE_INVALID`
20. `PLUGIN_ERROR_REPORT_WRITE_FAILED`

### 4.6 Install Source Policy and Consent

1. v1 allowed install sources are `npm` and `file` only.
2. `file` source install requires explicit source declaration (`--source file` or `file:` URI input).
3. Source verification level is recorded in lockfile as `verification: verified|unverified`.
4. Unverified source install shows explicit warning and requires interactive consent, or explicit non-interactive flag `--allow-unverified`.
5. Install without required consent fails with `PLUGIN_UNVERIFIED_SOURCE_REJECTED`.
6. In non-interactive/no-TTY contexts, consent prompts are not attempted; unverified installs fail unless `--allow-unverified` is provided.

### 4.7 Startup Error Report Schema

1. `plugin-errors.json` is versioned with `schemaVersion: 1`.
2. Required top-level keys: `schemaVersion`, `generatedAt`, `projectRoot`, `strictMode`, `errors`.
3. Each `errors[]` item must include: `pluginId`, `code`, `message`, `phase`, `sourceType`, `retryable`.
4. File is overwritten each startup to avoid stale error interpretation.

## 5) Plugin Manifest and Runtime Contract

1. Required manifest fields: `manifestVersion`, `id`, `version`, `pluginApiVersion`, `saisoRange`, `entry`, `capabilities`.
2. Required export: `registerCommands(program, context)`.
3. Optional exports: `init(context)`, `doctor(context)`.
4. Optional `configSchema` must be JSON Schema (draft 2020-12).
5. Strict config behavior is host-defined as follows:
   1. If schema root `type` is not `object`, fail with `PLUGIN_CONFIG_SCHEMA_INVALID`.
   2. If root `additionalProperties` is omitted, host treats root `additionalProperties` as `false`.
   3. Unknown root config keys are rejected with `PLUGIN_CONFIG_INVALID`.
   4. Nested object strictness is not auto-injected; plugin authors must define nested `additionalProperties` explicitly.
6. v1 host supports `manifestVersion: 1`; other versions fail with `PLUGIN_MANIFEST_INVALID`.
7. Lifecycle timing semantics are frozen:
   1. For enabled plugins, `init(context)` runs first at startup after manifest/integrity/compatibility checks and before any command registration.
   2. If `init(context)` fails, plugin is treated as load-failed and follows section 4.3 policy.
   3. `registerCommands(program, context)` runs only after successful `init` (or immediately when `init` is absent).
   4. `doctor(context)` never runs during startup; it runs only when explicitly invoked via `saiso plugin doctor [id]`.

### 5.1 Frozen Plugin Context API (v1)

1. Context is the only host API surface provided to plugins in v1.
2. Required context keys:
   1. `paths`: `projectRoot`, `saisoDir`, `pluginConfigPath`, `pluginDataDir`.
   2. `logger`: `debug|info|warn|error`.
   3. `config`: `readConfig()`, `writeConfig(next)`.
   4. `fs`: `resolveProjectPath(rel)`, `readProjectFile(rel)`, `writeProjectFile(rel, content)`.
   5. `env`: `get(name)` read-only accessor.
3. Context does not expose raw process mutation APIs.
4. Host helper `resolveProjectPath` rejects path traversal outside project root.
5. v1 policy states write scope is project-root-oriented via context helpers; hard sandboxing is deferred.

## 6) State Model, Artifact Store, and Precedence

1. Global metadata file: `~/.saiso/plugins.json`.
2. Global artifact cache root: `~/.saiso/plugins/cache/`.
3. Runtime load source in project context is always artifact cache path resolved from project lockfile entries.
4. Project authority file: `<project>/.saiso/plugins.lock.json`.
5. Plugin config file: `<project>/.saiso/plugins/<plugin-id>.json`.
6. Project lockfile is authoritative for project runs.
7. Global metadata never overrides project lock resolution.
8. Lock entries must include artifact locator fields:
   1. `sourceType`: `npm|file`
   2. `artifactKey`
   3. source-specific integrity fields from section 4.4
9. Missing cache artifact for enabled lock entry fails with `PLUGIN_ARTIFACT_NOT_FOUND`.
10. Deterministic plugin load/registration order is lockfile order.
11. File write and corruption handling rules:
   1. Lockfile/config/error-report writes are atomic (`*.tmp` write + fsync + rename).
   2. Malformed lockfile JSON fails with `PLUGIN_LOCKFILE_INVALID_JSON`.
   3. Malformed plugin config JSON fails with `PLUGIN_CONFIG_FILE_INVALID`.
   4. Startup continues when error-report write fails, but emits `PLUGIN_ERROR_REPORT_WRITE_FAILED`.
12. Cache lifecycle policy (v1):
   1. Plugin cache is append-only and content-addressed by `artifactKey`.
   2. `saiso plugin remove <id>` updates project lock state only and does not delete cache artifacts.
   3. Re-install of the same artifact reuses existing cache by `artifactKey`.
   4. Automatic cache garbage collection is out of scope for v1 and deferred to v1.1.

### 6.1 Frozen Lockfile Schema (v1)

1. Top-level schema is strict and required fields are:
   1. `lockfileVersion` (number, must be `1`)
   2. `plugins` (array)
2. Unknown top-level keys are rejected.
3. Each `plugins[]` entry is strict and required fields are:
   1. `id` (string, matches section 4.2)
   2. `version` (string)
   3. `manifestVersion` (number)
   4. `pluginApiVersion` (string)
   5. `saisoRange` (string)
   6. `sourceType` (`npm|file`)
   7. `artifactKey` (string)
   8. `entry` (string)
   9. `enabled` (boolean)
   10. `verification` (`verified|unverified`)
   11. `manifestSha256` (string, lowercase hex)
4. Source-specific required fields:
   1. `npm`: `resolved`, `integrity`
   2. `file`: `filePath`, `contentSha256`
5. Unknown plugin-entry keys are rejected.
6. Lockfile does not contain mutable timestamps; install/update timing metadata belongs only to global metadata.

## 7) CLI UX (v1)

1. `saiso plugin add <package>`
2. `saiso plugin remove <id>`
3. `saiso plugin list`
4. `saiso plugin enable <id>`
5. `saiso plugin disable <id>`
6. `saiso plugin doctor [id]`
7. `saiso plugin info <id>`

### 7.1 Project Context Resolution Rules

1. Commands that modify project lock state require project context and fail otherwise with `PLUGIN_PROJECT_CONTEXT_REQUIRED`:
   1. `add`, `remove`, `enable`, `disable`.
2. Commands that can run outside project context default to global metadata view:
   1. `list`, `info`, `doctor`.
3. In project context, `list|info|doctor` resolve against project lock and include effective enablement state.
4. Reserved command namespace policy:
   1. Base SAISO command tree is reserved and cannot be shadowed by plugins.
   2. Any attempt to register a reserved root command or alias fails with `PLUGIN_COLLISION`.

## 8) CLI UX (v1.1)

1. `saiso plugin update <id|all>` is deferred to v1.1 to keep v1 focused.

## 9) Implementation Phases

1. P1 Host foundation: manifest parser, ID validator, compatibility gates, error code framework.
2. P2 Resolver/state: lockfile v1 schema, migration logic, artifact-cache contract, source-specific integrity verification.
3. P3 CLI integration: `saiso plugin *` commands and command-injection pipeline with collision checks.
4. P4 Config/doctor: config schema validation, config persistence, plugin doctor/reporting, startup error report writer.
5. P5 CI hardening: unit/integration/e2e plus security regressions and base-command regression gates.

## 10) Test Plan (including security regressions)

1. Unit tests for manifest parse, ID regex, compatibility checks, error code determinism.
2. Unit tests for config schema strictness semantics and schema invalid-root handling.
3. Integration tests for add/enable/disable/remove and command registration lifecycle.
4. Integration tests for no-project command behavior and deterministic context resolution.
5. Lockfile migration tests for supported and unsupported versions.
6. Security regression tests for tampered lockfile, tampered package content, alias/path command collisions, and source-policy consent failures.
7. Baseline regression test proving base SAISO commands are unchanged with no enabled plugins.

## 11) Acceptance Criteria

1. Enabled plugins load from project lockfile only and register commands deterministically.
2. Incompatible plugins are blocked with deterministic error codes.
3. Collision detection covers full command paths and aliases.
4. Disable/remove removes plugin command surface on next CLI startup.
5. Resolution is reproducible from lockfile with source-specific integrity verification and cache artifact mapping.
6. Plugin config validation is strict and deterministic when schema exists.
7. Startup behavior on plugin failures follows documented policy and writes versioned deterministic error report.
8. No-project command behavior is deterministic and matches context rules.
9. Security regression cases fail predictably with expected error codes.
10. Plugin `init`/`registerCommands` execution order and timing follow the frozen lifecycle semantics.
