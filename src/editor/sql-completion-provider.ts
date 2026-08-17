/**
 * SQL completion provider — port of SQLCompletionProvider.swift.
 * Orchestrates context analysis + schema to produce ranked completion candidates.
 */

import type { ColumnInfo } from '../types/query';
import type { TableInfo } from '../types/schema';
import { analyzeSQLContext } from './sql-context-analyzer';
import type { SQLCompletionItem, SQLContext, TableReference } from './sql-completion-types';
import { SQLClauseType } from './sql-completion-types';
import {
  functionItems,
  makeColumnItem,
  makeKeywordItem,
  makeTableItem,
  operatorItems,
} from './sql-keywords';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SchemaData {
  tables: TableInfo[];
  columnsByTable: Map<string, ColumnInfo[]>;
}

const MAX_SUGGESTIONS = 20;
const MIN_PREFIX_LENGTH = 1;

// ---------------------------------------------------------------------------
// Schema helpers
// ---------------------------------------------------------------------------

function tableCompletionItems(schema: SchemaData): SQLCompletionItem[] {
  return schema.tables.map((t) =>
    makeTableItem(t.name, t.tableType?.toLowerCase() === 'view'),
  );
}

function columnCompletionItemsForTable(
  tableName: string,
  schema: SchemaData,
): SQLCompletionItem[] {
  const key = tableName.toLowerCase();
  for (const [k, cols] of schema.columnsByTable) {
    if (k.toLowerCase() === key) {
      return cols.map((c) =>
        makeColumnItem(c.name, c.typeName, tableName, c.isPrimaryKey, c.nullable),
      );
    }
  }
  return [];
}

function resolveAlias(aliasOrName: string, refs: TableReference[], schema: SchemaData): string | null {
  const lower = aliasOrName.toLowerCase();
  for (const ref of refs) {
    if (ref.alias?.toLowerCase() === lower) return ref.tableName;
  }
  for (const ref of refs) {
    if (ref.tableName.toLowerCase() === lower) return ref.tableName;
  }
  for (const t of schema.tables) {
    if (t.name.toLowerCase() === lower) return t.name;
  }
  return null;
}

function allColumnsInScope(refs: TableReference[], schema: SchemaData): SQLCompletionItem[] {
  const items: SQLCompletionItem[] = [];
  const hasMultiple = refs.length > 1;
  for (const ref of refs) {
    const cols = columnCompletionItemsForTable(ref.tableName, schema);
    for (const col of cols) {
      if (hasMultiple) {
        const qualifier = ref.alias ?? ref.tableName;
        const qualified = `${qualifier}.${col.label}`;
        items.push({
          ...col,
          label: qualified,
          insertText: qualified,
          filterText: qualified.toLowerCase(),
        });
      } else {
        items.push(col);
      }
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Keyword helpers
// ---------------------------------------------------------------------------

function filterKeywords(keywords: string[]): SQLCompletionItem[] {
  return keywords.map(makeKeywordItem);
}

function boostedKeywords(keywords: string[], priority: number): SQLCompletionItem[] {
  return keywords.map((kw) => ({ ...makeKeywordItem(kw), sortPriority: priority }));
}

function dataTypeKeywords(): SQLCompletionItem[] {
  const types = [
    'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT',
    'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL',
    'VARCHAR', 'CHAR', 'TEXT',
    'DATE', 'TIME', 'DATETIME', 'TIMESTAMP',
    'BOOLEAN', 'BOOL',
    // Extended common types
    'MEDIUMINT', 'DOUBLE PRECISION',
    'TINYTEXT', 'MEDIUMTEXT', 'LONGTEXT',
    'BLOB', 'CLOB', 'NCHAR', 'NVARCHAR',
    'YEAR', 'INTERVAL', 'TIMESTAMPTZ', 'TIMETZ',
    'BIT', 'JSON', 'JSONB', 'XML', 'ARRAY',
    'UUID', 'BINARY', 'VARBINARY', 'BYTEA',
    'ENUM', 'SET',
    'SERIAL', 'BIGSERIAL', 'SMALLSERIAL', 'MONEY',
  ];
  return types.map((t) => ({ ...makeKeywordItem(t), sortPriority: 380 }));
}

// ---------------------------------------------------------------------------
// Candidate generation
// ---------------------------------------------------------------------------

function getCandidates(context: SQLContext, schema: SchemaData): SQLCompletionItem[] {
  const items: SQLCompletionItem[] = [];

  // Dot prefix → column completions for specific table/alias
  if (context.dotPrefix !== null) {
    const tableName = resolveAlias(context.dotPrefix, context.tableReferences, schema);
    if (tableName) return columnCompletionItemsForTable(tableName, schema);
    return [];
  }

  switch (context.clauseType) {
    case SQLClauseType.From:
    case SQLClauseType.Join:
      items.push(...tableCompletionItems(schema));
      items.push(
        ...filterKeywords([
          'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN',
          'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
          'CROSS JOIN', 'NATURAL JOIN', 'JOIN',
          'ON', 'USING', 'WHERE', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT',
          'UNION', 'INTERSECT', 'EXCEPT',
        ]),
      );
      break;

    case SQLClauseType.Into:
      items.push(...tableCompletionItems(schema));
      items.push(
        ...filterKeywords([
          'VALUES', 'SELECT', 'SET',
          'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN',
          'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
          'CROSS JOIN', 'NATURAL JOIN', 'JOIN',
          'ON', 'USING', 'WHERE', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT',
          'UNION', 'INTERSECT', 'EXCEPT',
        ]),
      );
      break;

    case SQLClauseType.Select: {
      const funcName = context.currentFunction;
      if (funcName) {
        if (funcName.toUpperCase() === 'COUNT') {
          items.push({ ...makeKeywordItem('*'), label: '*', insertText: '*', detail: 'All columns', sortPriority: 10 });
          items.push({ ...makeKeywordItem('DISTINCT'), sortPriority: 20 });
        }
        items.push(...allColumnsInScope(context.tableReferences, schema));
        items.push(...functionItems());
        items.push(...filterKeywords(['NULL', 'TRUE', 'FALSE']));
        if (funcName.toUpperCase() !== 'COUNT') {
          items.push(...filterKeywords(['DISTINCT']));
        }
      } else {
        items.push({ ...makeKeywordItem('*'), label: '*', insertText: '*', detail: 'All columns', sortPriority: 50 });
        for (const ref of context.tableReferences) {
          const qualifier = ref.alias ?? ref.tableName;
          items.push({
            ...makeKeywordItem(`${qualifier}.*`),
            label: `${qualifier}.*`,
            insertText: `${qualifier}.*`,
            detail: `All columns from ${ref.tableName}`,
            sortPriority: 60,
          });
        }
        items.push(...allColumnsInScope(context.tableReferences, schema));
        items.push(...functionItems());
        items.push(
          ...filterKeywords(['DISTINCT', 'ALL', 'AS', 'FROM', 'CASE', 'WHEN', 'INTO', 'UNION', 'INTERSECT', 'EXCEPT']),
        );
      }
      break;
    }

    case SQLClauseType.On: {
      items.push(...allColumnsInScope(context.tableReferences, schema));
      for (const ref of context.tableReferences) {
        const qualifier = ref.alias ?? ref.tableName;
        const cols = columnCompletionItemsForTable(ref.tableName, schema);
        for (const col of cols) {
          items.push({
            ...col,
            label: `${qualifier}.${col.label}`,
            insertText: `${qualifier}.${col.label}`,
            documentation: `Column from ${ref.tableName}`,
            sortPriority: 80,
            filterText: `${qualifier}.${col.label}`.toLowerCase(),
          });
        }
      }
      items.push(...operatorItems());
      items.push(...filterKeywords(['AND', 'OR', 'NOT', 'IS', 'NULL', 'TRUE', 'FALSE']));
      break;
    }

    case SQLClauseType.Where:
    case SQLClauseType.And:
    case SQLClauseType.Having:
      items.push(...allColumnsInScope(context.tableReferences, schema));
      items.push(...operatorItems());
      items.push(
        ...filterKeywords([
          'AND', 'OR', 'NOT', 'IN', 'LIKE', 'ILIKE', 'BETWEEN', 'IS',
          'NULL', 'NOT NULL', 'TRUE', 'FALSE', 'EXISTS', 'NOT EXISTS',
          'ANY', 'ALL', 'SOME', 'REGEXP', 'RLIKE', 'SIMILAR TO',
          'IS NULL', 'IS NOT NULL',
        ]),
      );
      items.push(...functionItems());
      items.push(
        ...filterKeywords(['ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'UNION', 'INTERSECT', 'EXCEPT']),
      );
      break;

    case SQLClauseType.GroupBy:
      items.push(...allColumnsInScope(context.tableReferences, schema));
      items.push(
        ...filterKeywords(['HAVING', 'ORDER BY', 'LIMIT', 'UNION', 'INTERSECT', 'EXCEPT']),
      );
      break;

    case SQLClauseType.OrderBy:
      items.push(...allColumnsInScope(context.tableReferences, schema));
      items.push(
        ...filterKeywords(['ASC', 'DESC', 'NULLS FIRST', 'NULLS LAST', 'LIMIT', 'OFFSET', 'UNION', 'INTERSECT', 'EXCEPT']),
      );
      break;

    case SQLClauseType.Set: {
      const firstTable = context.tableReferences[0];
      if (firstTable) items.push(...columnCompletionItemsForTable(firstTable.tableName, schema));
      items.push(...filterKeywords(['WHERE', 'RETURNING']));
      break;
    }

    case SQLClauseType.InsertColumns: {
      const firstTable = context.tableReferences[0];
      if (firstTable) items.push(...columnCompletionItemsForTable(firstTable.tableName, schema));
      break;
    }

    case SQLClauseType.Values:
      items.push(...functionItems());
      items.push(
        ...filterKeywords(['NULL', 'DEFAULT', 'TRUE', 'FALSE', 'ON CONFLICT', 'ON DUPLICATE KEY UPDATE', 'RETURNING']),
      );
      break;

    case SQLClauseType.FunctionArg: {
      const isCount = context.currentFunction?.toUpperCase() === 'COUNT';
      if (isCount) {
        items.push({ ...makeKeywordItem('*'), label: '*', insertText: '*', detail: 'All columns', sortPriority: 10 });
        items.push({ ...makeKeywordItem('DISTINCT'), sortPriority: 20 });
      }
      items.push(...allColumnsInScope(context.tableReferences, schema));
      items.push(...functionItems());
      if (isCount) {
        items.push(...filterKeywords(['NULL', 'TRUE', 'FALSE']));
      } else {
        items.push(...filterKeywords(['NULL', 'TRUE', 'FALSE', 'DISTINCT']));
      }
      break;
    }

    case SQLClauseType.CaseExpression:
      items.push(...allColumnsInScope(context.tableReferences, schema));
      items.push(
        ...filterKeywords(['WHEN', 'THEN', 'ELSE', 'END', 'AND', 'OR', 'IS', 'NULL', 'TRUE', 'FALSE']),
      );
      items.push(...operatorItems());
      items.push(...functionItems());
      break;

    case SQLClauseType.InList:
      items.push(...allColumnsInScope(context.tableReferences, schema));
      items.push(...filterKeywords(['SELECT', 'NULL', 'TRUE', 'FALSE']));
      items.push(...functionItems());
      break;

    case SQLClauseType.Limit:
      items.push(...filterKeywords(['OFFSET', 'FETCH', 'NEXT', 'ROWS', 'ONLY']));
      break;

    case SQLClauseType.AlterTable:
      items.push(
        ...filterKeywords([
          'ADD', 'DROP', 'MODIFY', 'CHANGE', 'RENAME',
          'COLUMN', 'INDEX', 'PRIMARY', 'FOREIGN', 'KEY',
          'CONSTRAINT', 'ENGINE', 'CHARSET', 'COLLATE', 'AUTO_INCREMENT',
          'COMMENT', 'DEFAULT', 'CHARACTER SET',
          'PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK',
        ]),
      );
      break;

    case SQLClauseType.AlterTableColumn: {
      const firstTable = context.tableReferences[0];
      if (firstTable) items.push(...columnCompletionItemsForTable(firstTable.tableName, schema));
      break;
    }

    case SQLClauseType.CreateTable:
      if (context.nestingLevel >= 1) {
        items.push(
          ...boostedKeywords(
            ['REFERENCES', 'ON DELETE', 'ON UPDATE', 'CASCADE', 'RESTRICT', 'SET NULL', 'NO ACTION'],
            300,
          ),
        );
        items.push(
          ...filterKeywords([
            'PRIMARY', 'KEY', 'FOREIGN', 'UNIQUE',
            'NOT', 'NULL', 'DEFAULT',
            'AUTO_INCREMENT', 'SERIAL',
            'CHECK', 'CONSTRAINT', 'INDEX',
          ]),
        );
        items.push(...dataTypeKeywords());
      } else {
        items.push(...filterKeywords(['IF NOT EXISTS', 'ENGINE', 'CHARSET', 'COLLATE', 'COMMENT', 'TABLESPACE']));
      }
      break;

    case SQLClauseType.ColumnDef:
      items.push(...dataTypeKeywords());
      items.push(
        ...filterKeywords([
          'NOT', 'NULL', 'DEFAULT', 'AUTO_INCREMENT', 'SERIAL',
          'PRIMARY', 'KEY', 'UNIQUE', 'REFERENCES', 'CHECK',
          'UNSIGNED', 'SIGNED', 'FIRST', 'AFTER', 'COMMENT',
          'COLLATE', 'CHARACTER SET', 'ON UPDATE', 'ON DELETE',
          'CASCADE', 'RESTRICT', 'SET NULL', 'NO ACTION',
        ]),
      );
      break;

    case SQLClauseType.Returning:
      items.push(...allColumnsInScope(context.tableReferences, schema));
      items.push(...filterKeywords(['*']));
      break;

    case SQLClauseType.Union:
      items.push(...filterKeywords(['SELECT', 'ALL']));
      break;

    case SQLClauseType.Using:
      items.push(...allColumnsInScope(context.tableReferences, schema));
      break;

    case SQLClauseType.Window:
      items.push(...allColumnsInScope(context.tableReferences, schema));
      items.push(
        ...filterKeywords([
          'PARTITION BY', 'ORDER BY', 'ASC', 'DESC',
          'ROWS', 'RANGE', 'GROUPS', 'BETWEEN', 'UNBOUNDED',
          'PRECEDING', 'FOLLOWING', 'CURRENT ROW',
        ]),
      );
      break;

    case SQLClauseType.DropObject:
      items.push(...tableCompletionItems(schema));
      items.push(...filterKeywords(['IF EXISTS', 'CASCADE', 'RESTRICT']));
      break;

    case SQLClauseType.CreateIndex:
      if (context.tableReferences.length === 0) {
        items.push(...tableCompletionItems(schema));
        items.push(...filterKeywords(['ON']));
      } else {
        items.push(...allColumnsInScope(context.tableReferences, schema));
        items.push(...filterKeywords(['USING', 'BTREE', 'HASH', 'GIN', 'GIST']));
      }
      break;

    case SQLClauseType.CreateView:
      items.push(...filterKeywords(['SELECT', 'AS']));
      items.push(...tableCompletionItems(schema));
      break;

    case SQLClauseType.Unknown:
    default:
      items.push(
        ...filterKeywords([
          // DML
          'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'MERGE', 'UPSERT',
          // DDL
          'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME',
          // Diagnostic
          'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN', 'ANALYZE',
          // Transaction
          'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'START TRANSACTION',
          // CTE
          'WITH', 'RECURSIVE',
          // Misc
          'USE', 'SET', 'GRANT', 'REVOKE', 'CALL', 'EXECUTE', 'PREPARE',
        ]),
      );
      items.push(...tableCompletionItems(schema));
      break;
  }

  return items;
}

// ---------------------------------------------------------------------------
// Fuzzy matching
// ---------------------------------------------------------------------------

function fuzzyMatchScore(pattern: string, target: string): number | null {
  if (pattern.length === 0 || target.length === 0) return null;
  let pi = 0;
  let ti = 0;
  let gaps = 0;
  let consecutive = 0;
  let maxConsecutive = 0;
  let lastMatch = -1;

  while (pi < pattern.length && ti < target.length) {
    if (pattern.charCodeAt(pi) === target.charCodeAt(ti)) {
      if (lastMatch === ti - 1) {
        consecutive++;
        if (consecutive > maxConsecutive) maxConsecutive = consecutive;
      } else {
        if (lastMatch >= 0) gaps += ti - lastMatch - 1;
        consecutive = 1;
      }
      lastMatch = ti;
      pi++;
    }
    ti++;
  }

  if (pi < pattern.length) return null;
  return Math.max(0, 50 + gaps * 10 - maxConsecutive * 15);
}

function filterByPrefix(items: SQLCompletionItem[], prefix: string): SQLCompletionItem[] {
  if (prefix.length < MIN_PREFIX_LENGTH) return items;
  const lower = prefix.toLowerCase();
  return items.filter((item) => {
    const ft = item.filterText;
    if (ft.startsWith(lower)) return true;
    if (ft.includes(lower)) return true;
    return fuzzyMatchScore(lower, ft) !== null;
  });
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

function calculateScore(item: SQLCompletionItem, prefix: string, context: SQLContext): number {
  let score = item.sortPriority;

  if (item.filterText.startsWith(prefix)) score -= 500;
  if (item.filterText === prefix) score -= 1000;

  if (prefix.length === 0 && context.tableReferences.length > 0 && !context.isAfterComma) {
    if (item.kind === 'keyword') score -= 300;
  } else {
    switch (context.clauseType) {
      case SQLClauseType.From:
      case SQLClauseType.Join:
      case SQLClauseType.Into:
      case SQLClauseType.DropObject:
      case SQLClauseType.CreateIndex:
        if (item.kind === 'table' || item.kind === 'view') score -= 200;
        break;
      case SQLClauseType.Select:
      case SQLClauseType.Where:
      case SQLClauseType.And:
      case SQLClauseType.On:
      case SQLClauseType.Having:
      case SQLClauseType.GroupBy:
      case SQLClauseType.OrderBy:
      case SQLClauseType.Returning:
      case SQLClauseType.Using:
      case SQLClauseType.Window:
        if (item.kind === 'column') score -= 200;
        break;
      case SQLClauseType.Set:
      case SQLClauseType.InsertColumns:
        if (item.kind === 'column') score -= 300;
        break;
      default:
        break;
    }
  }

  score += item.label.length;

  if (prefix.length > 0) {
    const ft = item.filterText;
    if (!ft.startsWith(prefix) && !ft.includes(prefix)) {
      const penalty = fuzzyMatchScore(prefix, ft);
      if (penalty !== null) score += penalty;
    }
  }

  return score;
}

function rankResults(
  items: SQLCompletionItem[],
  prefix: string,
  context: SQLContext,
): SQLCompletionItem[] {
  const lower = prefix.toLowerCase();
  return [...items].sort(
    (a, b) => calculateScore(a, lower, context) - calculateScore(b, lower, context),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getCompletions(
  text: string,
  cursorPosition: number,
  schema: SchemaData,
): { items: SQLCompletionItem[]; context: SQLContext } {
  const context = analyzeSQLContext(text, cursorPosition);

  if (context.isInsideString || context.isInsideComment) {
    return { items: [], context };
  }

  let candidates = getCandidates(context, schema);

  if (context.prefix.length > 0) {
    candidates = filterByPrefix(candidates, context.prefix);
  }

  candidates = rankResults(candidates, context.prefix, context);

  return { items: candidates.slice(0, MAX_SUGGESTIONS), context };
}
