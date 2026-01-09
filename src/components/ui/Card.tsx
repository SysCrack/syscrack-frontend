"use client";

import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "interactive";
}

const Card = ({
  className,
  variant = "default",
  children,
  ...props
}: CardProps) => {
  const baseStyles =
    "rounded-xl border border-[var(--color-border)] bg-[var(--color-canvas-bg)] overflow-hidden";

  const variants = {
    default: "shadow-[var(--shadow-sm)]",
    interactive:
      "shadow-[var(--shadow-sm)] transition-all duration-200 hover:shadow-[var(--shadow-md)] hover:border-[var(--color-primary)]/30 cursor-pointer",
  };

  return (
    <div className={cn(baseStyles, variants[variant], className)} {...props}>
      {children}
    </div>
  );
};

const CardHeader = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("p-5 pb-0", className)} {...props}>
    {children}
  </div>
);

const CardContent = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("p-5", className)} {...props}>
    {children}
  </div>
);

const CardFooter = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "p-5 pt-0 flex items-center",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

Card.displayName = "Card";
CardHeader.displayName = "CardHeader";
CardContent.displayName = "CardContent";
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardContent, CardFooter };

