---
name: write-tests
description: >
  Write regression and unit tests for TablePro Windows. Use this skill only
  for `tablepro-windows/` when asked to add test coverage, write Vitest tests,
  add Rust unit tests, or create regression tests for a Windows bug or feature.
---

# TablePro Windows Test Writing Guide

Use this skill only for `tablepro-windows/`.

This app has 2 test tracks:
- TypeScript tests with Vitest under `tablepro-windows/src/**/*.test.ts`
- Rust tests with `cargo test --workspace` under `tablepro-windows/src-tauri/`

## Source of truth

Read these first:
- `tablepro-windows/package.json`
- `tablepro-windows/vitest.config.ts`
- `tablepro-windows/.github/workflows/windows-build.yml`
- changed source files
- nearby existing tests in the same area

## Validation commands

### TypeScript
Run from `tablepro-windows/`:
```bash
npx vitest run
npx eslint .
```

### Rust
Run from `tablepro-windows/src-tauri/`:
```bash
cargo test --workspace
```

CI also runs:
```bash
cargo clippy --workspace -- -D warnings
```
Use it when Rust changes could trigger lint issues.

## Test placement

### Frontend / TS
Put tests next to the feature or under `src/__tests__/`.

Existing references:
- `tablepro-windows/src/__tests__/statement-scanner.test.ts`
- `tablepro-windows/src/__tests__/editor-store.test.ts`
- `tablepro-windows/src/__tests__/change-store.test.ts`
- `tablepro-windows/src/__tests__/column-type.test.ts`
- `tablepro-windows/src/components/connection/connection-url-parser.test.ts`
- `tablepro-windows/src/components/connection/engine-icon.test.ts`

Vitest includes:
- `src/**/*.test.ts`

The config also aliases Tauri API calls to the test mock:
- `tablepro-windows/src/__tests__/mocks/tauri.ts`

### Backend / Rust
Prefer inline unit tests in the same module using `#[cfg(test)] mod tests`.

Existing references:
- `tablepro-windows/src-tauri/src/models/connection.rs`
- `tablepro-windows/src-tauri/src/models/schema.rs`
- `tablepro-windows/src-tauri/src/commands/query.rs`
- `tablepro-windows/src-tauri/src/commands/export.rs`
- `tablepro-windows/src-tauri/src/storage/connection_store.rs`
- `tablepro-windows/src-tauri/src/services/sql_generator.rs`

## Choose the right test type

### Write TS tests when changes touch
- React components
- Zustand stores
- TS utilities and parsers
- client-side query helpers
- connection form defaults and UI mapping

### Write Rust tests when changes touch
- Tauri commands
- connection/session management
- storage and services
- plugin SDK types
- driver crates and result conversion

If a change crosses both layers, add tests in both layers.

## Vitest template

```ts
import { describe, expect, it } from 'vitest';

import { parseConnectionUrl } from './connection-url-parser';

describe('parseConnectionUrl', () => {
  it('parses a postgres url', () => {
    const result = parseConnectionUrl('postgres://user:pass@localhost:5432/app');

    expect(result.dbType).toBe('postgres');
    expect(result.host).toBe('localhost');
    expect(result.port).toBe(5432);
    expect(result.database).toBe('app');
  });
});
```

Guidance:
- keep tests deterministic
- reset shared store state between tests if needed
- use the Tauri mock instead of calling the real runtime
- cover empty input, invalid input, and boundary cases

## Rust test template

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_expected_sql() {
        let sql = build_query("users", 50, 0);
        assert!(sql.contains("users"));
    }
}
```

Guidance:
- prefer small unit tests close to the implementation
- use `#[tokio::test]` only when async behavior is being tested
- test error paths, unsupported cases, and conversion failures
- do not hit a real database unless the user explicitly asked for integration coverage

## Good patterns to reuse

### TS
- pure function tests for parsers and utilities
- store tests that set up state, run one action, assert final state
- small component behavior tests when the logic is not already covered in utilities

### Rust
- unit tests for model parsing and SQL generation
- storage tests using temp files or in-memory state where already supported
- service tests for serialization, validation, and edge-case handling

## Regression-test rule

For bug fixes, add the test that would have failed before the fix.

That usually means covering:
- empty strings
- missing fields
- malformed URLs
- unsupported db type values
- null / optional fields on TS side
- conversion and ownership errors on Rust side

## What not to do

- do not use live network calls in unit tests
- do not require a running database unless the user explicitly asks for integration tests
- do not mock half the app when a small pure-unit test is enough
- do not put TS tests outside `src/**/*.test.ts` unless the config is updated too
- do not skip lint/clippy checks when the changed code could fail them

## Quick workflow

1. Read the changed file and nearby tests.
2. Choose TS, Rust, or both.
3. Add focused regression and edge-case coverage.
4. Run `cargo test --workspace` for Rust changes.
5. Run `npx vitest run` and `npx eslint .` for TS changes.
6. If Rust changes are substantial, run `cargo clippy --workspace -- -D warnings`.
