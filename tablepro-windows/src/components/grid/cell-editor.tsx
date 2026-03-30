import React, { useState, useEffect, useRef, useCallback } from "react";
import { categorizeColumn } from "../../types/column-type";
import { EnumCellEditor } from "./enum-cell-editor";

interface CellEditorProps {
  value: string | null;
  columnName: string;
  typeName: string;
  enumValues?: string[];
  onCommit: (v: string | null) => void;
  onCancel: () => void;
  autoFocus?: boolean;
}

export function CellEditor({
  value,
  columnName: _columnName,
  typeName,
  enumValues = [],
  onCommit,
  onCancel,
  autoFocus = true,
}: CellEditorProps) {
  const [inputValue, setInputValue] = useState<string>(value ?? "");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);
  const committedRef = useRef(false);
  const category = categorizeColumn(typeName);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      if ("select" in inputRef.current && typeof inputRef.current.select === "function") {
        inputRef.current.select();
      }
    }
  }, [autoFocus]);

  const handleCommit = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(inputValue);
  }, [inputValue, onCommit]);

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

  const inlineClass = "w-full h-full border-none outline-none bg-blue-50 dark:bg-blue-900/30 text-xs px-1";

  if (category === "enum" && enumValues.length > 0) {
    const isSet = typeName.toUpperCase().startsWith("SET");
    return (
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
        className={inlineClass}
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
        className="absolute z-20 w-[300px] border border-blue-400 rounded bg-white dark:bg-zinc-800 p-1 font-mono text-xs resize-y shadow-lg"
      />
    );
  }

  if (category === "date") {
    const isDateTime =
      typeName.toLowerCase().includes("timestamp") ||
      typeName.toLowerCase().includes("datetime");
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type={isDateTime ? "datetime-local" : "date"}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
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
