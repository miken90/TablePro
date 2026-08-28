import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  children: ReactNode;
  className?: string;
}

/** Canonical surface (design-spec 5.16, SCR-08): elevated bg, subtle border, hover strengthens both. */
export function Card({ children, className, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={[
        "rounded-md border border-border-subtle bg-surface-elevated p-xl shadow-sm",
        "transition duration-fast ease-snappy hover:border-border hover:shadow-base",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
