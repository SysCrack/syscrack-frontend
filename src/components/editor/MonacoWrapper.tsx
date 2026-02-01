"use client";

import { useRef, useCallback } from "react";
import Editor, { OnMount, OnChange } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useUIStore } from "@/stores/uiStore";
import { useEditorStore } from "@/stores/editorStore";

interface MonacoWrapperProps {
  problemId: number;
  defaultValue?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}

export function MonacoWrapper({
  problemId,
  defaultValue = "",
  onChange,
  disabled = false,
}: MonacoWrapperProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const theme = useUIStore((state) => state.theme);
  const fontSize = useEditorStore((state) => state.fontSize);
  const getCode = useEditorStore((state) => state.getCode);
  const setCode = useEditorStore((state) => state.setCode);

  // Get saved code or use default
  const savedCode = getCode(problemId);
  const initialValue = savedCode ?? defaultValue;

  const handleEditorDidMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
    
    // Focus the editor
    editor.focus();
  }, []);

  const handleChange: OnChange = useCallback(
    (value) => {
      const code = value ?? "";
      // Save to store (persisted to localStorage)
      setCode(problemId, code);
      // Notify parent
      onChange?.(code);
    },
    [problemId, setCode, onChange]
  );

  // Get current code from editor
  const getValue = useCallback(() => {
    return editorRef.current?.getValue() ?? "";
  }, []);

  // Set editor value programmatically
  const setValue = useCallback((value: string) => {
    editorRef.current?.setValue(value);
  }, []);

  return (
    <div className="relative h-full w-full">
      <Editor
        height="100%"
        language="sql"
        theme={theme === "dark" ? "vs-dark" : "vs-light"}
        value={initialValue}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        options={{
          fontSize,
          fontFamily: "'SF Mono', 'Cascadia Code', 'Consolas', monospace",
          lineNumbers: "on",
          minimap: { enabled: false },
          autoClosingBrackets: "always",
          autoClosingQuotes: "always",
          tabSize: 2,
          wordWrap: "on",
          scrollBeyondLastLine: false,
          padding: { top: 16, bottom: 16 },
          readOnly: disabled,
          renderLineHighlight: "line",
          cursorBlinking: "smooth",
          smoothScrolling: true,
          contextmenu: true,
          folding: true,
          lineDecorationsWidth: 8,
          automaticLayout: true,
        }}
        loading={
          <div className="h-full w-full flex items-center justify-center bg-[var(--color-editor-bg)]">
            <div className="h-6 w-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        }
      />
      
      {/* Overlay when disabled */}
      {disabled && (
        <div className="absolute inset-0 bg-[var(--color-canvas-bg)]/50 cursor-not-allowed" />
      )}
    </div>
  );
}
