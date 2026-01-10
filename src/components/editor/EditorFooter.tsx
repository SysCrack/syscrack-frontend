"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui";

interface EditorFooterProps {
  code: string;
  onSubmit: () => void;
  isSubmitting?: boolean;
}

export function EditorFooter({
  code,
  onSubmit,
  isSubmitting = false,
}: EditorFooterProps) {
  const characterCount = code.length;
  const isMac = typeof navigator !== "undefined" && navigator.platform.includes("Mac");
  const shortcutKey = isMac ? "⌘" : "Ctrl";

  return (
    <div className="flex items-center justify-between h-14 px-4 border-t border-[var(--color-border)] bg-[var(--color-panel-bg)]">
      {/* Left side - Submit button */}
      <Button
        onClick={onSubmit}
        disabled={isSubmitting || code.trim().length === 0}
        className="min-w-[120px]"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Running...
          </>
        ) : (
          "Run Query"
        )}
      </Button>

      {/* Right side - Character count and keyboard hint */}
      <div className="flex items-center gap-4 text-sm text-[var(--color-text-tertiary)]">
        <span>{characterCount} characters</span>
        <span className="hidden sm:inline">
          {shortcutKey}+Enter to run
        </span>
      </div>
    </div>
  );
}
