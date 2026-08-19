# PHD Production Readiness P0 Report

## Scope and baseline

- Baseline HEAD in the synchronized clone: `f5e66619826a7dc51e31928f1953e7094ca11437` (`refactor evidence closure and fix service port`).
- Target branch: `codex/p0-production-readiness-2`.
- `/root/article` is an unpacked working directory rather than a Git checkout; the temporary clone at `/tmp/research-p0-sync.C6Dwt0/research` was the clean Git baseline.
- The main directory contained user-local `.env.local`, `.local/` SQLite/WAL/PDF state, `.next/`, `.next-build/`, logs and PDFs. These are excluded from synchronization. No API key, user database, PDF, model output or build cache is committed.
- Production hard-code scan requested by handoff: zero matches in `app components lib scripts data` for `C2C`, `second-hand`, `seller-contact`, `AI-Assisted Product Descriptions`, `default workspace` and `default manuscript`.

## P0 implementation status

1. **Research and evidence modes**: `researchMode` and `evidenceMode` are separate persisted fields. Prospective, empirical, theoretical and review status cannot be confused with exploratory/formal evidence gating.
2. **Claim Coverage and citation audit**: sentence-level `ClaimCoverage` classifies published facts, researcher inferences, planned hypotheses, planned methods, definitions and connective text. `CitationAudit` invokes it and persists the linked report ID.
3. **Generation preflight**: structured schema validation, citation-token validation, Claim Coverage, CitationAudit and consistency checks run before promotion. Unsupported output is stored as `QuarantinedDraft` and never overwrites the current manuscript.
4. **Formal export gate**: `FormalExportGate` is the single gate for formal Markdown, DOCX, BibTeX and project export routes. It checks mode, current version, coverage, citation audit, consistency review, human approval, publication status, institution and required sections.
5. **Transactional verification records**: `VerificationEvent` and verified `Work` updates are written in one transaction with project membership checks.
6. **Publication status**: `PublicationStatusService` includes a Crossref adapter and preserves `clear`, `corrected`, `retracted`, `expression_of_concern` and `unknown`; failed provider calls remain `failed`/`unknown`.
7. **Citation formatting**: `CitationService` renders APA 7 and GB/T 7714. No unsupported Harvard mode remains. Citation tokens do not leak into exports.
8. **Immutable document versions**: full-manuscript and section saves create a global `DocumentVersion` snapshot with content hashes, parent version, evidence links, optimistic locking and transactional persistence. Existing snapshots are rebound from the latest snapshot when legacy document pointers are missing. Restore creates a new version.
9. **Assistant workflows and legacy cleanup**: `AssistantWorkflowRun` is idempotent by project/key. Chapter evidence-repair requests route to the multi-step `section_revision` plan. Worker proposal generation requires `projectId`; the old unscoped free-text fallback is removed. Quarantine records retain both Coverage and CitationAudit report IDs.
10. **Data safety and UI**: SQLite uses WAL, checkpointed migration backups, SHA-256 checksums, integrity checks and migration run records. ResultsCenter again exposes Dataset, DatasetVersion, variable dictionary and AnalysisRun forms, preserving existing result gating. Production seed data is domain-neutral.

## Data model and migration

Documents store `current_version_id` and `current_version_number`; immutable snapshots live in `document_snapshots`, while section DraftVersions remain in `document_versions`. Evidence closure creates CandidateRecord, VerificationEvent, EvidenceExcerpt, Claim Coverage, CitationAudit, QuarantinedDraft, publication-status, export-manifest and AssistantWorkflowRun tables. Migration ID is `evidence-closure-v2` and is idempotent through `schema_migrations`.

Before migration, the service runs `PRAGMA wal_checkpoint(FULL)`, creates `.pre-evidence-closure-v2.sqlite` once, records its SHA-256, captures before/after table counts, runs `PRAGMA integrity_check`, and records the result in `migration_runs`. SQL failures roll back the transaction. Restoring a backup file is intentionally an administrative/manual recovery action; it is not silently attempted by application code.

## Verification results

The original baseline had 9 failing tests: the invalid snapshot query, missing assistant chapter-repair routing, old worker assumptions and exporter fixtures that depended on deleted production seed content. Those failures were corrected without restoring production examples.

Final serial checks:

- `npm run lint`: passed, 0 errors and 0 warnings.
- `npm run typecheck`: passed.
- `npm test`: passed, 18 files and 83 tests.
- `npm test -- --run`: passed, 18 files and 83 tests.
- `npm run build`: passed; Next.js production build completed and emitted `.next-build/BUILD_ID`.
- The full-text test still emits pdf.js's non-fatal `standardFontDataUrl` warning; it does not fail the test.

## Manual acceptance

1. Start with `npm run dev` and create two projects; confirm documents, evidence, datasets, results, assistant jobs and exports remain project-scoped.
2. Save a section and then attempt a stale `expectedVersion`; confirm the write is rejected and a new immutable global version exists for a complete manuscript save.
3. Ask the assistant to “检查并补充第三章参考文献”; confirm `section_revision`, persisted workflow idempotency and a reviewable diff without automatic body replacement.
4. Generate a formal section with an unsupported published fact; confirm `QuarantinedDraft`, linked Coverage/CitationAudit reports and unchanged current正文.
5. Register a planned AnalysisRun and confirm Results remains blocked; register a completed real run with dataset version and confirm empirical mode becomes eligible.
6. Run CitationAudit and FormalExportGate, approve consistency review, then verify APA and GB/T exports contain only registered, verified works and no `[[CITE:...]]` tokens.
7. Verify migration backup checksum and `migration_runs` integrity status in the local SQLite database before any production rollout.

## Known limitations

- Formal export still requires institution-specific verified requirements and human consistency approval; a generic baseline is deliberately blocked as a formal submission profile.
- Crossref publication-status checks are adapter-backed and depend on provider availability; `unknown` is preserved rather than promoted.
- Backup restoration is manual and should be rehearsed operationally before production use.
- The application is a local single-user workbench; authentication, multi-user authorization and remote object storage are outside this P0 scope.
- Build/test commands require Node.js 22 because the project uses the built-in `node:sqlite` driver.
