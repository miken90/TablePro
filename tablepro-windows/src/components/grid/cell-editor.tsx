import React, { useState, useEffect, useRef } from "react";
import { categorizeColumn } from "../../types/column-type";

interface CellEditorProps {
  value: string | null;
  columnName: string;
  typeName: string;
  onCommit: (v: string | null) => void;
  onCancel: () => void;
  autoFocus?: boolean;
  style?: React.CSSProperties;
}

export function CellEditor({
  value,
  columnName: _columnName,
  typeName,
  onCommit,
  onCancel,
  autoFocus = true,
  style,
}: CellEditorProps) {
  const [inputValue, setInputValue] = useState<string>(value ?? "");
  const [isNull, setIsNull] = useState<boolean>(value === null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);
  const category = categorizeColumn(typeName);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleCommit = () => {
    onCommit(isNull ? null : inputValue);
  };

  const handleSetNull = () => {
    setIsNull(true);
    setInputValue("");
  };

  const handleClearNull = () => {
    setIsNull(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key === "Enter" && category !== "json") {
      e.stopPropagation();
      handleCommit();
      return;
    }
    e.stopPropagation();
  };

  const renderInput = () => {
    if (category === "boolean") {
      let selectVal = "";
      if (!isNull) {
        const lower = inputValue.toLowerCase();
        if (lower === "true" || lower === "t" || lower === "1") selectVal = "true";
        else if (lower === "false" || lower === "f" || lower === "0") selectVal = "false";
      }
      return (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={selectVal}
          onChange={(e) => {
            if (e.target.value === "") {
              setIsNull(true);
              setInputValue("");
            } else {
              setIsNull(false);
              setInputValue(e.target.value);
            }
          }}
          className="w-full border border-zinc-300 rounded px-1 py-0.5 text-xs dark:bg-zinc-700 dark:border-zinc-600"
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
          value={isNull ? "" : inputValue}
          disabled={isNull}
          placeholder={isNull ? "[NULL]" : ""}
          onChange={(e) => setInputValue(e.target.value)}
          className="w-full border border-zinc-300 rounded px-1 py-0.5 font-mono text-xs dark:bg-zinc-700 dark:border-zinc-600 resize-y"
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
          value={isNull ? "" : inputValue}
          disabled={isNull}
          placeholder={isNull ? "[NULL]" : ""}
          onChange={(e) => setInputValue(e.target.value)}
          className="w-full border border-zinc-300 rounded px-1 py-0.5 text-xs dark:bg-zinc-700 dark:border-zinc-600"
        />
      );
    }

    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={isNull ? "" : inputValue}
        disabled={isNull}
        placeholder={isNull ? "[NULL]" : ""}
        onChange={(e) => setInputValue(e.target.value)}
        className="w-full border border-zinc-300 rounded px-1 py-0.5 text-xs dark:bg-zinc-700 dark:border-zinc-600"
      />
    );
  };

  return (
    <div
      className="absolute z-20 shadow-lg border border-blue-400 rounded bg-white dark:bg-zinc-800 p-1 min-w-[160px]"
      style={style}
      onKeyDown={handleKeyDown}
    >
      <div className="mb-1">{renderInput()}</div>
      <div className="flex gap-1 justify-between">
        <div className="flex gap-1">
          {!isNull ? (
            <button
              type="button"
              onClick={handleSetNull}
              className="border border-zinc-300 px-1.5 py-0.5 rounded text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
            >
              Set NULL
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClearNull}
              className="border border-zinc-300 px-1.5 py-0.5 rounded text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
            >
              Clear NULL
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleCommit}
          className="bg-blue-600 text-white px-2 py-0.5 rounded text-xs hover:bg-blue-700"
        >
          OK
        </button>
      </div>
    </div>
  );
}
