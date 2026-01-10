"use client";

import { CheckCircle, AlertTriangle, XCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface FeedbackIssue {
  issue_type: string;
  severity: string;
  message: string;
}

interface FeedbackListProps {
  messages?: string[];
  issues?: FeedbackIssue[];
  className?: string;
}

export function FeedbackList({ messages = [], issues = [], className }: FeedbackListProps) {
  if (messages.length === 0 && issues.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Success messages */}
      {messages.map((message, index) => (
        <div
          key={`msg-${index}`}
          className="flex items-start gap-2 text-sm"
        >
          <CheckCircle className="h-4 w-4 mt-0.5 text-green-500 flex-shrink-0" />
          <span className="text-[var(--color-text-secondary)]">{message}</span>
        </div>
      ))}

      {/* Issues */}
      {issues.map((issue, index) => {
        const isWarning = issue.severity === "warning";
        const isError = issue.severity === "error";
        const isInfo = issue.severity === "info";

        const Icon = isError ? XCircle : isWarning ? AlertTriangle : Info;
        const iconColor = isError
          ? "text-red-500"
          : isWarning
          ? "text-amber-500"
          : "text-blue-500";

        return (
          <div
            key={`issue-${index}`}
            className="flex items-start gap-2 text-sm"
          >
            <Icon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", iconColor)} />
            <span className="text-[var(--color-text-secondary)]">
              {issue.message}
            </span>
          </div>
        );
      })}
    </div>
  );
}
