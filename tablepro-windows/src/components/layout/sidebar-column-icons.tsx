import { Hash, AlignLeft, Calendar, ToggleLeft, Binary } from "lucide-react";

export function getColumnIcon(typeName: string) {
  const t = typeName.toLowerCase();
  if (
    t.includes("int") ||
    t.includes("float") ||
    t.includes("double") ||
    t.includes("numeric") ||
    t.includes("decimal")
  ) {
    return <Hash size={10} className="shrink-0 text-blue-400" />;
  }
  if (t.includes("char") || t.includes("text") || t.includes("string") || t.includes("varchar")) {
    return <AlignLeft size={10} className="shrink-0 text-green-500" />;
  }
  if (t.includes("date") || t.includes("time") || t.includes("timestamp")) {
    return <Calendar size={10} className="shrink-0 text-purple-500" />;
  }
  if (t.includes("bool")) {
    return <ToggleLeft size={10} className="shrink-0 text-orange-500" />;
  }
  return <Binary size={10} className="shrink-0 text-zinc-400" />;
}
