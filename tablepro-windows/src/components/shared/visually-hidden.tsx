import type { ReactNode } from "react";

interface VisuallyHiddenProps {
  children: ReactNode;
  as?: keyof JSX.IntrinsicElements;
}

/** Renders content only for screen readers (visually hidden). */
export function VisuallyHidden({ children, as: Tag = "span" }: VisuallyHiddenProps) {
  return <Tag className="sr-only">{children}</Tag>;
}
