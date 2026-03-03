interface VimModeIndicatorProps {
  mode: "NORMAL" | "INSERT" | "VISUAL" | "REPLACE";
  enabled: boolean;
}

const MODE_COLORS: Record<string, string> = {
  NORMAL: "bg-blue-600 text-white",
  INSERT: "bg-green-600 text-white",
  VISUAL: "bg-purple-600 text-white",
  REPLACE: "bg-red-600 text-white",
};

export function VimModeIndicator({ mode, enabled }: VimModeIndicatorProps) {
  if (!enabled) return null;

  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${MODE_COLORS[mode] ?? "bg-zinc-700 text-zinc-300"}`}
    >
      {mode}
    </span>
  );
}
