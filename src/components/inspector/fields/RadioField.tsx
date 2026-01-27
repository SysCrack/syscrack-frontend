'use client';

interface RadioOption {
    value: string;
    label: string;
    description?: string;
}

interface RadioFieldProps {
    label: string;
    value: string;
    options: RadioOption[];
    onChange: (value: string) => void;
    helpText?: string;
}

export function RadioField({ label, value, options, onChange, helpText }: RadioFieldProps) {
    return (
        <div className="space-y-2.5">
            <label className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                {label}
            </label>
            <div className="space-y-2">
                {options.map((option) => (
                    <label
                        key={option.value}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${value === option.value
                                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                                : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-text-tertiary)]'
                            }`}
                    >
                        <input
                            type="radio"
                            name={label}
                            value={option.value}
                            checked={value === option.value}
                            onChange={(e) => onChange(e.target.value)}
                            className="mt-0.5 w-4 h-4 text-[var(--color-primary)] border-[var(--color-border)] focus:ring-[var(--color-primary)] focus:ring-offset-0"
                        />
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-[var(--color-text-primary)]">
                                {option.label}
                            </div>
                            {option.description && (
                                <div className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5 leading-tight">
                                    {option.description}
                                </div>
                            )}
                        </div>
                    </label>
                ))}
            </div>
            {helpText && (
                <p className="text-[10px] text-[var(--color-text-tertiary)] italic leading-tight">
                    {helpText}
                </p>
            )}
        </div>
    );
}
