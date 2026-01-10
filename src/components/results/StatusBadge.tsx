"use client";

import { CheckCircle, AlertTriangle, XCircle, Clock, Ban } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type SubmissionStatus = "accepted" | "suboptimal" | "wrong" | "timeout" | "error";

interface StatusBadgeProps {
  status: SubmissionStatus;
  score?: number;
  className?: string;
}

const statusConfig: Record<
  SubmissionStatus,
  {
    label: string;
    icon: React.ElementType;
    bgClass: string;
    textClass: string;
    borderClass: string;
  }
> = {
  accepted: {
    label: "Accepted",
    icon: CheckCircle,
    bgClass: "bg-green-500/10",
    textClass: "text-green-600 dark:text-green-400",
    borderClass: "border-green-500/30",
  },
  suboptimal: {
    label: "Suboptimal",
    icon: AlertTriangle,
    bgClass: "bg-amber-500/10",
    textClass: "text-amber-600 dark:text-amber-400",
    borderClass: "border-amber-500/30",
  },
  wrong: {
    label: "Wrong Answer",
    icon: XCircle,
    bgClass: "bg-red-500/10",
    textClass: "text-red-600 dark:text-red-400",
    borderClass: "border-red-500/30",
  },
  timeout: {
    label: "Timeout",
    icon: Clock,
    bgClass: "bg-amber-500/10",
    textClass: "text-amber-600 dark:text-amber-400",
    borderClass: "border-amber-500/30",
  },
  error: {
    label: "Error",
    icon: Ban,
    bgClass: "bg-red-500/10",
    textClass: "text-red-600 dark:text-red-400",
    borderClass: "border-red-500/30",
  },
};

export function StatusBadge({ status, score, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2 rounded-lg border",
        config.bgClass,
        config.textClass,
        config.borderClass,
        className
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="font-semibold">{config.label}</span>
      {score !== undefined && (
        <span className="font-bold">({score}/100)</span>
      )}
    </div>
  );
}
