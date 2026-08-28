// @vitest-environment jsdom
/**
 * RT-2 — Safe Mode reaches the grid.
 *
 * Safe Mode was enforced inside `queryStore.execute`, and the grid save never
 * goes through it: it called the `save_changes` IPC directly. A Read-Only
 * (level 5) session could therefore still write through the data grid, which
 * is the one place a user writes without typing any SQL.
 *
 * The check now runs on the statements the backend says it will execute, and
 * a refusal must leave the staged edits alone — losing someone's edits as the
 * punishment for a blocked save would be worse than the hole.
 */

import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetInvokeImpl, __setInvokeImpl } from '../../__tests__/mocks/tauri';
import { useChangeStore } from '../../stores/changeStore';
import { useQueryStore } from '../../stores/queryStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { QueryResult } from '../../types/query';
import { useChangeTracking, type UseChangeTrackingReturn } from './hooks/use-change-tracking';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const RESULT: QueryResult = {
  columns: [
    { name: 'id', dataType: 'int4', typeName: 'int4', nullable: false, isPrimaryKey: true },
    { name: 'name', dataType: 'text', typeName: 'varchar', nullable: true, isPrimaryKey: false },
  ],
  rows: [['1', 'ann']],
  affectedRows: 0,
  executionTimeMs: 1,
} as unknown as QueryResult;

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let api: UseChangeTrackingReturn | null = null;
let invoked: string[] = [];

function Probe() {
  const tracking = useChangeTracking({
    tableName: 'users',
    schema: 'public',
    sessionId: 'sess-1',
    result: RESULT,
    fetchTableData: async () => {},
    page: 1,
    pageSize: 100,
    sorting: [],
  });
  useEffect(() => { api = tracking; });
  return null;
}

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(createElement(Probe)); });
}

function stageDelete() {
  useChangeStore.getState().setActiveTable('conn-1', 'public', 'users');
  useChangeStore.getState().recordRowDelete(0, ['1', 'ann']);
}

beforeEach(() => {
  invoked = [];
  __setInvokeImpl((cmd: string) => {
    invoked.push(cmd);
    if (cmd === 'preview_statements') {
      return Promise.resolve({
        statements: ['DELETE FROM "public"."users" WHERE "id"=1'],
        transactional: false,
        begin: 'BEGIN',
        commit: 'COMMIT',
        rollback: 'ROLLBACK',
        dialect: 'postgres',
      });
    }
    return Promise.resolve({ rowsAffected: 1, statementsExecuted: 1 });
  });
  useChangeStore.setState({ _byTable: {}, _activeTableKey: null, _changes: {}, _undoStack: [], _redoStack: [], hasChanges: false });
  useQueryStore.setState({ pendingSafeCheck: null });
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  api = null;
  __resetInvokeImpl();
});

describe('Safe Mode gates the grid save', () => {
  it('level 5 refuses the write and keeps the staged edits', async () => {
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, safeModeLevel: 5 } }));
    stageDelete();
    mount();

    await act(async () => { await api!.handleSave(); });

    expect(invoked).toContain('preview_statements');
    expect(invoked).not.toContain('save_changes');
    expect(api!.saveError).toContain('Read-only');
    expect(Object.keys(useChangeStore.getState()._changes)).toHaveLength(1);
  });

  it('level 2 holds a staged DELETE in the safe-mode confirmation', async () => {
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, safeModeLevel: 2 } }));
    stageDelete();
    mount();

    await act(async () => { await api!.handleSave(); });

    const pending = useQueryStore.getState().pendingSafeCheck;
    expect(pending?.dangerType).toBe('destructive');
    expect(pending?.onConfirm).toBeTypeOf('function');
    expect(invoked).not.toContain('save_changes');
    expect(Object.keys(useChangeStore.getState()._changes)).toHaveLength(1);
  });

  it('confirming the hold resumes the save rather than running the SQL as a query', async () => {
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, safeModeLevel: 2 } }));
    stageDelete();
    mount();

    await act(async () => { await api!.handleSave(); });
    await act(async () => { await useQueryStore.getState().confirmSafeCheck(); });

    expect(invoked).toContain('save_changes');
    expect(invoked).not.toContain('execute_query');
  });

  it('level 0 writes straight through', async () => {
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, safeModeLevel: 0 } }));
    stageDelete();
    mount();

    await act(async () => { await api!.handleSave(); });

    expect(invoked).toContain('save_changes');
    expect(useQueryStore.getState().pendingSafeCheck).toBeNull();
  });
});
