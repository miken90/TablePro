import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  createTable,
  type CreateTableColumnDefinition,
  type CreateTableDefinition,
} from '../../ipc/commands';
import { extractErrorMessage } from '../../ipc/error';
import { ColumnDefinitionRow } from './column-definition-row';
import { Dialog } from '../ui';

interface CreateTableWizardProps {
  open: boolean;
  sessionId: string;
  driverType: string;
  availableSchemas: string[];
  initialSchema?: string | null;
  onClose: () => void;
  onCreated?: () => void;
}

const COMMON_TYPES = [
  'INT',
  'VARCHAR(255)',
  'TEXT',
  'BOOLEAN',
  'DATE',
  'TIMESTAMP',
  'DECIMAL(10,2)',
  'BIGINT',
  'JSON',
  'UUID',
];

const inputClassName =
  'w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 focus:border-blue-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200';

function buildPreviewDdl(definition: CreateTableDefinition, driverType: string): string {
  const dbType = driverType.toLowerCase();
  const quote = (name: string) => {
    if (dbType === 'mysql' || dbType === 'mariadb') return `\`${name.replace(/`/g, '``')}\``;
    if (dbType === 'mssql' || dbType === 'sqlserver' || dbType === 'sql_server') {
      return `[${name.replace(/]/g, ']]')}]`;
    }
    return `"${name.replace(/"/g, '""')}"`;
  };

  const tableName =
    (dbType === 'postgres' || dbType === 'postgresql') && definition.schema
      ? `${quote(definition.schema)}.${quote(definition.tableName)}`
      : quote(definition.tableName);

  const pkColumns: string[] = [];
  const columnLines = definition.columns.map((col) => {
    let line = `${quote(col.name)} ${col.dataType}`;
    if (col.autoIncrement) {
      if (dbType === 'mysql' || dbType === 'mariadb') line += ' AUTO_INCREMENT';
      else if (dbType === 'mssql' || dbType === 'sqlserver' || dbType === 'sql_server') line += ' IDENTITY(1,1)';
      else if (dbType === 'sqlite' || dbType === 'sqlite3') line = `${quote(col.name)} INTEGER PRIMARY KEY AUTOINCREMENT`;
      else if (dbType === 'postgres' || dbType === 'postgresql') {
        line = `${quote(col.name)} ${col.dataType.toUpperCase().includes('BIG') ? 'BIGSERIAL' : 'SERIAL'}`;
      }
    }

    if (!(dbType.startsWith('sqlite') && col.autoIncrement)) {
      line += col.nullable ? ' NULL' : ' NOT NULL';
      if (col.defaultValue?.trim()) {
        line += ` DEFAULT ${col.defaultValue.trim()}`;
      }
      if (col.primaryKey) {
        pkColumns.push(quote(col.name));
      }
    }

    return line;
  });

  if (pkColumns.length > 0) {
    columnLines.push(`PRIMARY KEY (${pkColumns.join(', ')})`);
  }

  return `CREATE TABLE ${tableName} (\n  ${columnLines.join(',\n  ')}\n)`;
}

const defaultColumn = (): CreateTableColumnDefinition => ({
  name: '',
  dataType: 'INT',
  nullable: false,
  defaultValue: '',
  primaryKey: false,
  autoIncrement: false,
});

export function CreateTableWizard({
  open,
  sessionId,
  driverType,
  availableSchemas,
  initialSchema,
  onClose,
  onCreated,
}: CreateTableWizardProps) {
  const [tableName, setTableName] = useState('');
  const [schema, setSchema] = useState(initialSchema ?? '');
  const [columns, setColumns] = useState<CreateTableColumnDefinition[]>([defaultColumn()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ddlPreview, setDdlPreview] = useState('');

  const canUseSchema = driverType.toLowerCase() === 'postgres' || driverType.toLowerCase() === 'postgresql';

  const definition = useMemo<CreateTableDefinition>(
    () => ({
      tableName: tableName.trim(),
      schema: canUseSchema ? schema.trim() || undefined : undefined,
      columns: columns.map((col) => ({
        ...col,
        name: col.name.trim(),
        defaultValue: col.defaultValue?.trim() || undefined,
      })),
    }),
    [tableName, schema, columns, canUseSchema],
  );

  const isValid =
    definition.tableName.length > 0 &&
    definition.columns.length > 0 &&
    definition.columns.every((col) => col.name.length > 0 && col.dataType.trim().length > 0);

  const reset = () => {
    setTableName('');
    setSchema(initialSchema ?? '');
    setColumns([defaultColumn()]);
    setError(null);
    setIsSubmitting(false);
    setDdlPreview('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAddColumn = () => {
    setColumns((prev) => [...prev, defaultColumn()]);
  };

  const handleUpdateColumn = (index: number, next: CreateTableColumnDefinition) => {
    setColumns((prev) => prev.map((col, i) => (i === index ? next : col)));
  };

  const handleRemoveColumn = (index: number) => {
    setColumns((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePreview = () => {
    setError(null);
    if (!isValid) {
      setError('Table name and at least one valid column are required.');
      return;
    }
    setDdlPreview(buildPreviewDdl(definition, driverType));
  };

  const handleCreate = async () => {
    setError(null);
    if (!isValid) {
      setError('Please complete table name and columns before creating.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createTable(sessionId, definition);
      setDdlPreview(result.ddl);
      onCreated?.();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Create Table"
      size="lg"
      actions={[{
        label: isSubmitting ? 'Creating…' : 'Create Table',
        onClick: () => void handleCreate(),
        disabled: isSubmitting,
        loading: isSubmitting,
      }]}
    >
      <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Table name</label>
              <input
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="users"
                className={inputClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Schema</label>
              <select
                disabled={!canUseSchema}
                value={schema}
                onChange={(e) => setSchema(e.target.value)}
                className={inputClassName}
              >
                <option value="">{canUseSchema ? 'Default schema' : 'Not used for this driver'}</option>
                {availableSchemas.map((schemaName) => (
                  <option key={schemaName} value={schemaName}>
                    {schemaName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-medium text-zinc-700 dark:text-zinc-200">Columns</h3>
              <button
                onClick={handleAddColumn}
                className="flex items-center gap-1 rounded border border-zinc-300 px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                <Plus size={12} />
                Add Column
              </button>
            </div>

            <div className="space-y-2">
              {columns.map((column, index) => (
                <ColumnDefinitionRow
                  key={`col-${index}`}
                  index={index}
                  column={column}
                  typeOptions={COMMON_TYPES}
                  onChange={handleUpdateColumn}
                  onRemove={handleRemoveColumn}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-xs font-medium text-zinc-700 dark:text-zinc-200">DDL Preview</h3>
              <button
                onClick={handlePreview}
                className="rounded border border-zinc-300 px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Generate Preview
              </button>
            </div>
            <pre className="max-h-40 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-2 text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              {ddlPreview || '-- Preview not generated yet'}
            </pre>
          </div>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
      </div>
    </Dialog>
  );
}
