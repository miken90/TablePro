import { useSettingsStore } from "../../stores/settings";

const fonts = [
  "Consolas",
  "Cascadia Code",
  "JetBrains Mono",
  "Fira Code",
  "Source Code Pro",
  "Courier New",
];

export function EditorSettings() {
  const { settings, updateSection } = useSettingsStore();
  if (!settings) return null;
  const editor = settings.editor;

  const update = (patch: Partial<typeof editor>) => {
    updateSection("editor", { ...editor, ...patch });
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Editor</h3>

      <div className="flex items-center justify-between">
        <label className="text-sm text-zinc-700 dark:text-zinc-300">Font Family</label>
        <select
          value={editor.fontFamily}
          onChange={(e) => update({ fontFamily: e.target.value })}
          className="select-field"
        >
          {fonts.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between">
        <label className="text-sm text-zinc-700 dark:text-zinc-300">Font Size</label>
        <input
          type="number"
          min={10}
          max={24}
          value={editor.fontSize}
          onChange={(e) => update({ fontSize: Number(e.target.value) })}
          className="input-field w-20"
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="text-sm text-zinc-700 dark:text-zinc-300">Tab Width</label>
        <select
          value={editor.tabWidth}
          onChange={(e) => update({ tabWidth: Number(e.target.value) })}
          className="select-field"
        >
          <option value={2}>2 spaces</option>
          <option value={4}>4 spaces</option>
          <option value={8}>8 spaces</option>
        </select>
      </div>

      <Toggle
        label="Show Line Numbers"
        checked={editor.showLineNumbers}
        onChange={(v) => update({ showLineNumbers: v })}
      />
      <Toggle
        label="Highlight Current Line"
        checked={editor.highlightCurrentLine}
        onChange={(v) => update({ highlightCurrentLine: v })}
      />
      <Toggle
        label="Auto Indent"
        checked={editor.autoIndent}
        onChange={(v) => update({ autoIndent: v })}
      />
      <Toggle
        label="Word Wrap"
        checked={editor.wordWrap}
        onChange={(v) => update({ wordWrap: v })}
      />
      <Toggle
        label="Show Minimap"
        checked={editor.showMinimap}
        onChange={(v) => update({ showMinimap: v })}
      />
      <Toggle
        label="Vim Mode"
        checked={editor.vimModeEnabled}
        onChange={(v) => update({ vimModeEnabled: v })}
      />
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-zinc-700 dark:text-zinc-300">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition ${checked ? "bg-blue-600" : "bg-zinc-600"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${checked ? "left-4" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}
