import { useState } from "react";

interface UpdateInfo {
  version: string;
  notes: string;
}

export function UpdateNotification({
  update,
  onDismiss,
  onInstall,
}: {
  update: UpdateInfo;
  onDismiss: () => void;
  onInstall: () => void;
}) {
  const [installing, setInstalling] = useState(false);

  const handleInstall = () => {
    setInstalling(true);
    onInstall();
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-zinc-700 bg-zinc-800 p-4 shadow-xl">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h4 className="text-sm font-semibold text-zinc-100">
            Update Available
          </h4>
          <p className="text-xs text-zinc-400">Version {update.version}</p>
        </div>
        <button
          onClick={onDismiss}
          className="text-zinc-500 hover:text-zinc-300"
        >
          ✕
        </button>
      </div>
      {update.notes && (
        <p className="mb-3 text-xs text-zinc-400 line-clamp-3">
          {update.notes}
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleInstall}
          disabled={installing}
          className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          {installing ? "Installing…" : "Install & Restart"}
        </button>
        <button
          onClick={onDismiss}
          className="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-600"
        >
          Later
        </button>
      </div>
    </div>
  );
}
