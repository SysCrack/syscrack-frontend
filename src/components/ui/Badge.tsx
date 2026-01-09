"use client";

import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "easy" | "medium" | "hard" | "premium" | "success" | "warning" | "error";
}

const Badge = ({
  className,
  variant = "default",
  children,
  ...props
}: BadgeProps) => {
  const baseStyles =
    "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors";

  const variants = {
    default:
      "bg-[var(--color-surface)] text-[var(--color-text-secondary)]",
    easy:
      "bg-[var(--color-easy)]/10 text-[var(--color-easy)] border border-[var(--color-easy)]/20",
    medium:
      "bg-[var(--color-medium)]/10 text-[var(--color-medium)] border border-[var(--color-medium)]/20",
    hard:
      "bg-[var(--color-hard)]/10 text-[var(--color-hard)] border border-[var(--color-hard)]/20",
    premium:
      "bg-[var(--color-premium)]/10 text-[var(--color-premium)] border border-[var(--color-premium)]/20",
    success:
      "bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/20",
    warning:
      "bg-[var(--color-warning)]/10 text-[var(--color-warning)] border border-[var(--color-warning)]/20",
    error:
      "bg-[var(--color-error)]/10 text-[var(--color-error)] border border-[var(--color-error)]/20",
  };

  return (
    <span
      className={cn(baseStyles, variants[variant], className)}
      {...props}
    >
      {children}
    </span>
  );
};

Badge.displayName = "Badge";

export { Badge };

