"use client";

import { useState, useCallback, useEffect } from "react";
import { MonacoWrapper } from "./MonacoWrapper";
import { EditorToolbar } from "./EditorToolbar";
import { EditorFooter } from "./EditorFooter";
import { useEditorStore } from "@/stores/editorStore";

interface EditorCanvasProps {
  problemId: number;
  starterCode?: string;
  onSubmit: (code: string) => void;
  isSubmitting?: boolean;
}

export function EditorCanvas({
  problemId,
  starterCode = "",
  onSubmit,
  isSubmitting = false,
}: EditorCanvasProps) {
  const getCode = useEditorStore((state) => state.getCode);
  const setCode = useEditorStore((state) => state.setCode);
  const resetCode = useEditorStore((state) => state.resetCode);

  // Local state for current code (synced with store)
  const [currentCode, setCurrentCode] = useState(() => {
    return getCode(problemId) ?? starterCode;
  });

  // Sync with store changes
  useEffect(() => {
    const savedCode = getCode(problemId);
    if (savedCode !== undefined) {
      setCurrentCode(savedCode);
    }
  }, [problemId, getCode]);

  // Initialize code in store if not present
  useEffect(() => {
    const savedCode = getCode(problemId);
    if (savedCode === undefined && starterCode) {
      setCode(problemId, starterCode);
      setCurrentCode(starterCode);
    }
  }, [problemId, starterCode, getCode, setCode]);

  const handleCodeChange = useCallback((code: string) => {
    setCurrentCode(code);
  }, []);

  const handleReset = useCallback(() => {
    resetCode(problemId, starterCode);
    setCurrentCode(starterCode);
  }, [problemId, starterCode, resetCode]);

  const handleSubmit = useCallback(() => {
    if (currentCode.trim()) {
      onSubmit(currentCode);
    }
  }, [currentCode, onSubmit]);

  // Keyboard shortcut: Cmd/Ctrl + Enter to submit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (!isSubmitting && currentCode.trim()) {
          handleSubmit();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSubmit, isSubmitting, currentCode]);

  return (
    <div className="flex flex-col h-full bg-[var(--color-editor-bg)]">
      <EditorToolbar onReset={starterCode ? handleReset : undefined} />
      
      <div className="flex-1 min-h-0">
        <MonacoWrapper
          problemId={problemId}
          defaultValue={starterCode}
          onChange={handleCodeChange}
          disabled={isSubmitting}
        />
      </div>
      
      <EditorFooter
        code={currentCode}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
