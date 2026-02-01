"use client";

import { RotateCcw, Sun, Moon, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { useUIStore } from "@/stores/uiStore";
import { useEditorStore } from "@/stores/editorStore";

interface EditorToolbarProps {
  onReset?: () => void;
}

export function EditorToolbar({ onReset }: EditorToolbarProps) {
  const theme = useUIStore((state) => state.theme);
  const toggleTheme = useUIStore((state) => state.toggleTheme);
  const fontSize = useEditorStore((state) => state.fontSize);
  const setFontSize = useEditorStore((state) => state.setFontSize);

  const handleDecreaseFontSize = () => {
    setFontSize(fontSize - 1);
  };

  const handleIncreaseFontSize = () => {
    setFontSize(fontSize + 1);
  };

  const handleReset = () => {
    if (onReset) {
      const confirmed = window.confirm(
        "Reset to starter code? Your changes will be lost."
      );
      if (confirmed) {
        onReset();
      }
    }
  };

  return (
    <div className="flex items-center justify-between h-12 px-4 border-b border-[var(--color-border)] bg-[var(--color-panel-bg)]">
      {/* Left side - Language indicator */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[var(--color-text-secondary)]">
          SQL
        </span>
        <span className="text-xs text-[var(--color-text-tertiary)]">
          PostgreSQL
        </span>
      </div>

      {/* Right side - Controls */}
      <div className="flex items-center gap-1">
        {/* Font size controls */}
        <div className="flex items-center gap-1 mr-2">
          <button
            onClick={handleDecreaseFontSize}
            className="p-1.5 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
            aria-label="Decrease font size"
            disabled={fontSize <= 10}
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="text-xs text-[var(--color-text-tertiary)] w-8 text-center">
            {fontSize}px
          </span>
          <button
            onClick={handleIncreaseFontSize}
            className="p-1.5 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
            aria-label="Increase font size"
            disabled={fontSize >= 24}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        >
          {theme === "light" ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
        </button>

        {/* Reset button */}
        {onReset && (
          <button
            onClick={handleReset}
            className="p-2 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
            aria-label="Reset to starter code"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
