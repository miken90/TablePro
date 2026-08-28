/**
 * V2 — the preview cannot lie, because the frontend cannot generate SQL.
 *
 * The grid used to carry its own statement generator for the preview. It
 * quoted identifiers ANSI-only, typed values by their shape instead of the
 * column's declared type, and always printed `BEGIN`/`COMMIT` — so on MySQL,
 * on SQL Server, on a varchar column holding `007`, and on any single-
 * statement save, the popover showed something the app would never run.
 *
 * The generator is deleted. Preview and execute both read the backend's
 * `preview_statements`. These tripwires stop a second generator coming back.
 */

import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function source(relativePath: string): string {
  const text = SOURCES[`../${relativePath}`];
  if (text === undefined) throw new Error(`source not found: ${relativePath}`);
  return text;
}

describe('no SQL statement is assembled in the grid', () => {
  it('no file under components/grid builds a DML statement from string literals', () => {
    const offenders: string[] = [];
    for (const [path, text] of Object.entries(SOURCES)) {
      if (!path.startsWith('../components/grid/')) continue;
      if (path.includes('.test.')) continue;
      text.split('\n').forEach((line, i) => {
        const writesInsert = line.includes('INSERT INTO');
        const writesUpdate = line.includes('UPDATE ') && line.includes('SET');
        const writesDelete = line.includes('DELETE FROM');
        if (writesInsert || writesUpdate || writesDelete) {
          offenders.push(`${path}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('the deleted generator and its helpers are gone', () => {
    const popover = source('components/grid/sql-preview-popover.tsx');
    expect(popover).not.toContain('generatePreviewSql');
    expect(popover).not.toContain('function escapeValue');
    expect(popover).not.toContain('function quoteIdent');
    expect(popover).not.toContain('function buildWherePredicate');
    expect(popover).not.toContain('function qualifiedTable');
  });

  it('both preview surfaces read the backend plan', () => {
    for (const path of [
      'components/grid/sql-preview-popover.tsx',
      'components/grid/confirm-execute-dialog.tsx',
    ]) {
      expect(source(path), path).toContain('useSavePlan');
    }
    expect(source('components/grid/use-save-plan.ts')).toContain('previewStatements');
  });

  it('the IPC surface exposes preview_statements', () => {
    const commands = source('ipc/commands.ts');
    expect(commands).toContain("invoke('preview_statements', { sessionId, payload })");
    expect(commands).toContain('export interface SavePlan');
  });

  it('preview and execute are built from the one payload builder', () => {
    const tracking = source('components/grid/hooks/use-change-tracking.ts');
    expect(tracking).toContain('buildSavePayload');
    const panel = source('components/grid/result-panel.tsx');
    expect(panel).toContain('buildSavePayload={buildSavePayload}');
    expect(panel).toContain('setConfirmExecutePayload(buildSavePayload())');
  });
});
