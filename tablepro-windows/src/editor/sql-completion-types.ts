/**
 * SQL autocomplete type definitions.
 * Port of SQLContextAnalyzer.swift and SQLCompletionItem.swift types.
 */

export enum SQLClauseType {
  Select = 'select',
  From = 'from',
  Join = 'join',
  On = 'on',
  Where = 'where',
  And = 'and',
  GroupBy = 'groupBy',
  OrderBy = 'orderBy',
  Having = 'having',
  Set = 'set',
  Into = 'into',
  Values = 'values',
  InsertColumns = 'insertColumns',
  FunctionArg = 'functionArg',
  CaseExpression = 'caseExpression',
  InList = 'inList',
  Limit = 'limit',
  AlterTable = 'alterTable',
  AlterTableColumn = 'alterTableColumn',
  CreateTable = 'createTable',
  ColumnDef = 'columnDef',
  Returning = 'returning',
  Union = 'union',
  Using = 'using',
  Window = 'window',
  DropObject = 'dropObject',
  CreateIndex = 'createIndex',
  CreateView = 'createView',
  Unknown = 'unknown',
}

export interface TableReference {
  tableName: string;
  alias: string | null;
}

export interface SQLContext {
  clauseType: SQLClauseType;
  prefix: string;
  prefixRange: { from: number; to: number };
  dotPrefix: string | null;
  tableReferences: TableReference[];
  isInsideString: boolean;
  isInsideComment: boolean;
  cteNames: string[];
  nestingLevel: number;
  currentFunction: string | null;
  isAfterComma: boolean;
}

export type CompletionItemKind =
  | 'keyword'
  | 'table'
  | 'view'
  | 'column'
  | 'function'
  | 'schema'
  | 'alias'
  | 'operator';

/** Base sort priority by kind (lower = higher priority). */
export const KIND_BASE_PRIORITY: Record<CompletionItemKind, number> = {
  column: 100,
  alias: 150,
  table: 200,
  view: 210,
  function: 300,
  operator: 350,
  keyword: 400,
  schema: 500,
};

export interface SQLCompletionItem {
  label: string;
  kind: CompletionItemKind;
  insertText: string;
  detail?: string;
  documentation?: string;
  sortPriority: number;
  filterText: string;
}
