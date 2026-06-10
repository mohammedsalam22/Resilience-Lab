import type { HTMLAttributes } from "react";

export function SoftCard({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-border bg-card shadow-sm dark:shadow-none ${className}`}
      {...props}
    />
  );
}
