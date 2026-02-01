'use client';

interface ToggleFieldProps {
    label: string;
    value: boolean;
    onChange: (value: boolean) => void;
    helpText?: string;
}

export function ToggleField({ label, value, onChange, helpText }: ToggleFieldProps) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between py-1">
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                    {label}
                </label>
                <button
                    onClick={() => onChange(!value)}
                    className={`
                        w-10 h-5 rounded-full transition-colors relative
                        ${value ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}
                    `}
                >
                    <div
                        className={`
                            absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform
                            ${value ? 'translate-x-5' : 'translate-x-0'}
                        `}
                    />
                </button>
            </div>
            {helpText && (
                <p className="text-[10px] text-[var(--color-text-tertiary)] italic leading-tight">
                    {helpText}
                </p>
            )}
        </div>
    );
}
