const ACCENT_COLORS: Record<string, string> = {
  blue: "#3b82f6",
  purple: "#8b5cf6",
  pink: "#ec4899",
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#eab308",
  green: "#22c55e",
  graphite: "#6b7280",
};

export function applyAccentColor(color: string) {
  const hex = ACCENT_COLORS[color] ?? ACCENT_COLORS.blue;
  document.documentElement.style.setProperty("--accent-color", hex);
}

export function isDarkMode(): boolean {
  return document.documentElement.classList.contains("dark");
}
