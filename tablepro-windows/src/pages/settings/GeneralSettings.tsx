import { useSettingsStore } from "../../stores/settings";

export function GeneralSettings() {
  const { settings, updateSection } = useSettingsStore();
  if (!settings) return null;
  const general = settings.general;

  const update = (patch: Partial<typeof general>) => {
    updateSection("general", { ...general, ...patch });
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">General</h3>

      <Field label="Startup Behavior">
        <select
          value={general.startupBehavior}
          onChange={(e) =>
            update({
              startupBehavior: e.target.value as typeof general.startupBehavior,
            })
          }
          className="select-field"
        >
          <option value="showWelcome">Show Welcome Screen</option>
          <option value="reopenLast">Reopen Last Session</option>
        </select>
      </Field>

      <Field label="Language">
        <select
          value={general.language}
          onChange={(e) =>
            update({ language: e.target.value as typeof general.language })
          }
          className="select-field"
        >
          <option value="system">System</option>
          <option value="en">English</option>
          <option value="vi">Tiếng Việt</option>
        </select>
      </Field>

      <Field label="Query Timeout (seconds)">
        <input
          type="number"
          min={0}
          max={600}
          value={general.queryTimeoutSeconds}
          onChange={(e) =>
            update({ queryTimeoutSeconds: Number(e.target.value) })
          }
          className="input-field w-24"
        />
      </Field>

      <Toggle
        label="Automatically check for updates"
        checked={general.automaticallyCheckForUpdates}
        onChange={(v) => update({ automaticallyCheckForUpdates: v })}
      />

      <Toggle
        label="Share anonymous analytics"
        checked={general.shareAnalytics}
        onChange={(v) => update({ shareAnalytics: v })}
      />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-zinc-700 dark:text-zinc-300">{label}</label>
      {children}
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
