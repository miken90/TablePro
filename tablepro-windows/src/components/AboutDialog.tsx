import { X } from "lucide-react";

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AboutDialog({ open, onClose }: AboutDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-[360px] rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">About TablePro</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col items-center p-6">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-2xl dark:bg-zinc-800">
            ⬡
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">TablePro</h3>
          <p className="text-xs text-zinc-500">Version 0.1.0</p>

          <div className="mt-4 w-full space-y-1 text-center text-xs text-zinc-500 dark:text-zinc-400">
            <p>Built with Tauri 2, React 19, TypeScript 5</p>
            <p>AG Grid · Monaco Editor · Tailwind CSS 4</p>
          </div>

          <a
            href="https://github.com/miken90/tablepro"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 text-xs text-blue-500 hover:underline"
          >
            github.com/miken90/tablepro
          </a>
        </div>
      </div>
    </div>
  );
}
