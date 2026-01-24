'use client';

interface NumberFieldProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    unit?: string;
    helpText?: string;
}

export function NumberField({ label, value, onChange, min = 0, max, unit, helpText }: NumberFieldProps) {
    return (
        <div className="space-y-1.5">
            <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                    {label}
                </label>
                {unit && (
                    <span className="text-[10px] font-medium text-[var(--color-text-tertiary)] bg-[var(--color-surface)] px-1.5 py-0.5 rounded border border-[var(--color-border)]">
                        {unit}
                    </span>
                )}
            </div>
            <input
                type="number"
                value={value}
                min={min}
                max={max}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent transition-all"
            />
            {helpText && (
                <p className="text-[10px] text-[var(--color-text-tertiary)] italic leading-tight">
                    {helpText}
                </p>
            )}
        </div>
    );
}
