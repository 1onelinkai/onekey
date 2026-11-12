# Claude Desktop and Grok Build Adapter Plan

> **For implementation:** Follow the steps below in order and verify each focused test before packaging.

**Goal:** Enable OneLinkAI's one-click configuration for Claude Desktop and Grok Build using their supported direct-provider formats.

**Architecture:** Keep the existing preview/apply/backup/restore pipeline. Claude Desktop writes the same four files used by CC Switch's direct 3P profile flow; Grok Build patches its TOML model selector and provider table. Neither adapter adds a local proxy, so each enforces the API protocol the client can call directly.

**Tech Stack:** Electron main process, React, `jsonc-parser`, `@iarna/toml`, Node test runner.

---

### Task 1: Claude Desktop direct profile

**Files:** `electron/agents.cjs`, `electron/agents.test.cjs`

1. Remove Claude Desktop from the unsupported list and resolve the normal and `Claude-3p` directories for macOS, Windows, and Linux.
2. Preview edits for normal config, 3P config, OneLinkAI profile, and `_meta.json`; set deployment mode to `3p`, register a stable profile ID, and write the Anthropic gateway URL and key.
3. Reject non-Anthropic protocol before generating a plan.
4. Test exact file output, preservation of unrelated profile metadata, preview redaction, and byte-for-byte restore.

### Task 2: Grok Build Responses profile

**Files:** `electron/agents.cjs`, `electron/agents.test.cjs`

1. Remove Grok Build from the unsupported list and require OpenAI Responses protocol.
2. Patch `~/.grok/config.toml` to select a stable OneLinkAI profile with the selected upstream model, `/v1` base URL, key, `responses` backend, and 500000 context window while preserving unrelated TOML tables.
3. Test valid output, preservation of user/MCP tables, malformed TOML rejection, redaction, and byte-for-byte restore.

### Task 3: Configuration UI and verification

**Files:** `src/DesktopApp.jsx`

1. Default Claude Desktop to Anthropic Messages and Grok Build to OpenAI Responses.
2. Disable protocol options the selected client cannot use, then run focused adapter tests, the full test suite, and production build.

## Research sources and supported scope

- CC Switch Claude Desktop manual: https://github.com/farion1231/cc-switch/blob/main/docs/user-manual/zh/2-providers/2.6-claude-desktop.md
- Profile deployment and registry: https://github.com/farion1231/cc-switch/blob/main/src-tauri/src/claude_desktop_config.rs
- Grok configuration fields: https://github.com/farion1231/cc-switch/blob/main/src-tauri/src/grok_config.rs
- Grok provider projection: https://github.com/farion1231/cc-switch/blob/main/src-tauri/src/live/project/grok.rs

Reviewed on 2026-11-04. These adapters implement direct connections. Claude Desktop requires a recognized Claude role model ID; arbitrary model aliases and protocol conversion require a separate authenticated local gateway, as documented by CC Switch. Client loading and a live upstream model request are distinct from configuration readback verification.
