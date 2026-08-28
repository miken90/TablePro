/**
 * The exhaustive routing table for the workspace body: every tab kind the
 * app knows (plus `undefined` and an unknown persisted string) × every engine
 * shape × session present/absent. This is the regression net for view-state
 * routing that a static-markup render cannot give — nothing else decides what
 * the active tab renders as.
 */

import { describe, expect, it } from 'vitest';
import { TAB_TYPES, type EditorTab, type TabType } from '../../stores/editorStore';
import { resolveWorkspaceView, type WorkspaceEngine } from './workspace-view-resolver';

type Engine = 'sql' | 'mongo' | 'redis';

function engine(kind: Engine, session: boolean, connected = true): WorkspaceEngine {
  return {
    isConnected: connected,
    sessionId: session ? 'sess-1' : undefined,
    isDocumentDb: kind === 'mongo',
    isKeyValueDb: kind === 'redis',
  };
}

function tab(type: string | undefined, withTable = true): EditorTab {
  return {
    id: 't1',
    title: 't',
    content: '',
    isDirty: false,
    isPreview: false,
    type: type as TabType | undefined,
    tableName: withTable ? 'users' : undefined,
    tableSchema: withTable ? 'public' : undefined,
  };
}

const EDITOR_BY_ENGINE: Record<Engine, string> = { sql: 'query', mongo: 'mongoQuery', redis: 'redisCommand' };

describe('resolveWorkspaceView', () => {
  it('is welcome whenever no connection is selected, regardless of tab', () => {
    for (const type of [...TAB_TYPES, undefined, 'bogus']) {
      for (const eng of ['sql', 'mongo', 'redis'] as Engine[]) {
        expect(resolveWorkspaceView(tab(type), engine(eng, true, false)).kind).toBe('welcome');
      }
    }
    expect(resolveWorkspaceView(null, engine('sql', false, false)).kind).toBe('welcome');
  });

  it('routes every editor kind (and no tab) by engine, with or without a session', () => {
    for (const type of ['query', 'mongoQuery', 'redisCommand', undefined]) {
      for (const eng of ['sql', 'mongo', 'redis'] as Engine[]) {
        for (const session of [true, false]) {
          expect(resolveWorkspaceView(tab(type), engine(eng, session)).kind).toBe(EDITOR_BY_ENGINE[eng]);
        }
      }
    }
    expect(resolveWorkspaceView(null, engine('sql', true)).kind).toBe('query');
    expect(resolveWorkspaceView(undefined, engine('redis', true)).kind).toBe('redisCommand');
  });

  it('renders a table tab as the grid on every engine and carries the table identity', () => {
    for (const eng of ['sql', 'mongo', 'redis'] as Engine[]) {
      for (const session of [true, false]) {
        const view = resolveWorkspaceView(tab('table'), engine(eng, session));
        expect(view).toEqual({ kind: 'table', tableName: 'users', schema: 'public' });
      }
    }
  });

  it('structure needs a SQL engine and a session', () => {
    expect(resolveWorkspaceView(tab('structure'), engine('sql', true))).toEqual({
      kind: 'structure', tableName: 'users', schema: 'public',
    });
    expect(resolveWorkspaceView(tab('structure'), engine('sql', false)).kind).toBe('connecting');
    for (const eng of ['mongo', 'redis'] as Engine[]) {
      for (const session of [true, false]) {
        const view = resolveWorkspaceView(tab('structure'), engine(eng, session));
        expect(view.kind).toBe('unsupported');
        expect(view.reason).toMatch(/structure/);
      }
    }
  });

  it('a table or structure tab without a table is unsupported, never a crash', () => {
    for (const type of ['table', 'structure']) {
      for (const eng of ['sql', 'mongo', 'redis'] as Engine[]) {
        expect(resolveWorkspaceView(tab(type, false), engine(eng, true)).kind).toBe('unsupported');
      }
    }
  });

  it('an unknown persisted kind is unsupported on every engine', () => {
    for (const eng of ['sql', 'mongo', 'redis'] as Engine[]) {
      for (const session of [true, false]) {
        const view = resolveWorkspaceView(tab('bogus'), engine(eng, session));
        expect(view.kind).toBe('unsupported');
        expect(view.reason).toBeTruthy();
      }
    }
  });

  it('covers every TabType the store declares', () => {
    // If a new tab kind is added, this forces a routing decision for it.
    const covered: TabType[] = ['query', 'table', 'structure', 'mongoQuery', 'redisCommand'];
    expect([...TAB_TYPES].sort()).toEqual([...covered].sort());
  });
});
