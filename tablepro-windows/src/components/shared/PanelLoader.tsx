import { Loader2 } from "lucide-react";

export function PanelLoader({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center h-full ${className ?? ""}`}>
      <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
    </div>
  );
}
