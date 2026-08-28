import React, { useState, useEffect, useRef, useCallback } from "react";
import { categorizeColumn } from "../../types/column-type";
import { EnumCellEditor } from "./enum-cell-editor";
import { ForeignKeyCellEditor } from "./foreign-key-cell-editor";
import type { FkRef } from "../../stores/schemaStore";

interface CellEditorProps {
  value: string | null;
  columnName: string;
  typeName: string;
  enumValues?: string[];
  onCommit: (v: string | null) => void;
  onCancel: () => void;
  autoFocus?: boolean;
  sessionId?: string;
  fkRef?: FkRef;
  trigger?: 'click' | 'keyboard';
}

function formatToHtml5(val: string | null, type: 'date' | 'time' | 'datetime-local'): string {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (!str) return '';

  if (type === 'date') {
    const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }
  
  if (type === 'time') {
    const match = str.match(/^(\d{2}:\d{2}(?::\d{2})?)/);
    return match ? match[1] : '';
  }
  
  if (type === 'datetime-local') {
    const match = str.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
    if (match) {
      return `${match[1]}T${match[2]}`;
    }
    return str.replace(' ', 'T');
  }
  
  return str;
}

function formatFromHtml5(val: string, type: 'date' | 'time' | 'datetime-local'): string {
  if (type === 'datetime-local') {
    return val.replace('T', ' ');
  }
  return val;
}

export function CellEditor({
  value,
  columnName: _columnName,
  typeName,
  enumValues = [],
  onCommit,
  onCancel,
  autoFocus = true,
  sessionId,
  fkRef,
  trigger,
}: CellEditorProps) {
  const category = categorizeColumn(typeName);
  const isDateTime = typeName.toLowerCase().includes("timestamp") || typeName.toLowerCase().includes("datetime");
  const isTime = typeName.toLowerCase().includes("time") && !isDateTime;
  const dateInputType = isDateTime ? "datetime-local" : isTime ? "time" : "date";

  const getInitialValue = () => {
    if (category === "date") {
      return formatToHtml5(value, dateInputType);
    }
    return value ?? "";
  };

  const [inputValue, setInputValue] = useState<string>(getInitialValue);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      if (trigger !== 'click' && "select" in inputRef.current && typeof inputRef.current.select === "function") {
        inputRef.current.select();
      }
      if (category === "date" && "showPicker" in inputRef.current) {
        try {
          (inputRef.current as HTMLInputElement).showPicker();
        } catch (err) {
          console.warn("showPicker failed", err);
        }
      }
    }
  }, [autoFocus, category, trigger]);

  const handleCommit = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    let finalValue: string | null = inputValue;
    if (category === "date") {
      finalValue = formatFromHtml5(inputValue, dateInputType);
    }
    if ((category === "date" || category === "integer" || category === "float") && finalValue === "") {
      finalValue = null;
    }
    onCommit(finalValue);
  }, [inputValue, onCommit, category, dateInputType]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key === "Delete" && e.ctrlKey) {
      e.stopPropagation();
      committedRef.current = true;
      onCommit(null);
      return;
    }
    if (e.key === "Enter" && category !== "json") {
      e.stopPropagation();
      handleCommit();
      return;
    }
    if (e.key === "Tab") {
      e.stopPropagation();
      handleCommit();
      return;
    }
    e.stopPropagation();
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (!committedRef.current) handleCommit();
    }, 0);
  };

  // Grid cells draw the "editing" indicator as a 1px inset ring, not the
  // standard outline, which would overlap adjacent cells (design-spec 5.8).
  const inlineClass =
    "w-full h-full border-none bg-blue-50 dark:bg-blue-900/30 text-xs px-1 [box-shadow:inset_0_0_0_1px_var(--color-focus-ring)]";

  if (fkRef && sessionId) {
    return (
      <ForeignKeyCellEditor
        sessionId={sessionId}
        fkRef={fkRef}
        value={value}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );
  }

  if (category === "enum" && enumValues.length > 0) {
    const isSet = typeName.toUpperCase().startsWith("SET");
    return (
      <div className="absolute top-0 left-0 z-50 min-w-full" style={{ width: 'max-content' }}>
        <EnumCellEditor
          values={enumValues}
          value={inputValue}
          isSet={isSet}
          isNull={value === null}
          disabled={false}
          onChangeValue={(next) => {
            committedRef.current = true;
            onCommit(next);
          }}
          onChangeSetValues={(next) => {
            setInputValue(next.join(","));
          }}
        />
      </div>
    );
  }

  if (category === "boolean") {
    let selectVal = "";
    const lower = inputValue.toLowerCase();
    if (lower === "true" || lower === "t" || lower === "1") selectVal = "true";
    else if (lower === "false" || lower === "f" || lower === "0") selectVal = "false";
    if (value === null) selectVal = "";

    return (
      <select
        ref={inputRef as React.RefObject<HTMLSelectElement>}
        value={selectVal}
        onChange={(e) => {
          const val = e.target.value;
          committedRef.current = true;
          onCommit(val === "" ? null : val);
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="w-full border border-blue-400 dark:border-blue-500 rounded bg-white dark:bg-zinc-800 text-xs px-1 shadow-lg"
        size={3}
        style={{ position: 'absolute', top: 0, left: 0, zIndex: 50, height: 'auto', minWidth: '100%' }}
      >
        <option value="">NULL</option>
        <option value="true">TRUE</option>
        <option value="false">FALSE</option>
      </select>
    );
  }

  if (category === "json") {
    return (
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        rows={4}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="absolute top-0 left-0 z-20 w-[300px] border border-blue-400 rounded bg-white dark:bg-zinc-800 p-1 font-mono text-xs resize-y shadow-lg"
      />
    );
  }

  if (category === "date") {
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type={dateInputType}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onClick={(e) => {
          try {
            (e.currentTarget as HTMLInputElement).showPicker();
          } catch (err) {
            void err;
          }
        }}
        className={inlineClass}
      />
    );
  }

  if (category === "integer" || category === "float") {
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="number"
        step={category === "integer" ? 1 : "any"}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={`${inlineClass} font-mono`}
      />
    );
  }

  // Default: text
  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type="text"
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      className={`${inlineClass} font-mono`}
    />
  );
}
