'use client';

interface SelectFieldProps {
    label: string;
    value: string;
    options: string[] | { label: string; value: string }[];
    onChange: (value: string) => void;
    helpText?: string;
}

export function SelectField({ label, value, options, onChange, helpText }: SelectFieldProps) {
    return (
        <div className="space-y-1.5">
            <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                    {label}
                </label>
            </div>
            <select
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-3 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent transition-all cursor-pointer"
            >
                {options.map((opt) => {
                    const label = typeof opt === 'string' ? opt : opt.label;
                    const val = typeof opt === 'string' ? opt : opt.value;
                    return (
                        <option key={val} value={val} className="bg-[var(--color-panel-bg)]">
                            {label}
                        </option>
                    );
                })}
            </select>
            {helpText && (
                <p className="text-[10px] text-[var(--color-text-tertiary)] italic leading-tight">
                    {helpText}
                </p>
            )}
        </div>
    );
}
