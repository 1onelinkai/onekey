# Model visibility, launch targets and editable previews

Goal: Keep hidden authorized models searchable by ID, offer detected desktop/CLI targets, and edit generated configuration before applying it.

Architecture: The platform adapter preserves showInSquare metadata without expanding key authorization. Detection supplies available target kinds; the launcher resolves paths again on each request. Editable previews use unique server-held secret placeholders, parse edited files before any disk write, and retain existing conflict detection, backups, rollback and restoration.

Tasks:
1. Add model filtering helper and tests for default visibility, hidden ID lookup and category behavior; retain public visibility metadata in platform adapter.
2. Add detected launch targets, main-process selection response and UI choice dialog; test both choices and invalid targets.
3. Add editable preview projection, placeholder reconstruction and format validation; accept edits through apply IPC and test malformed data, secret preservation, path tampering and restore.
4. Build, run affected tests and desktop flow checks. Preserve unrelated local edits.
