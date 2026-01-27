'use client';

import { useState } from 'react';
import { X, ArrowRight, Zap, MessageSquare, Globe } from 'lucide-react';
import { RadioField } from './fields/RadioField';
import { NumberField } from './fields/NumberField';
import { SystemComponentData } from '@/lib/utils/sceneParser';
import { getComponentTemplate } from '@/lib/templates/componentTemplates';
import type { Protocol } from '@/lib/types/design';

export interface ConnectionConfig {
    protocol: Protocol;
    throughput_qps: number;
    data_contract?: {
        request_format?: string;
        response_format?: string;
    };
}

interface ConnectionConfigModalProps {
    isOpen: boolean;
    sourceElement: { id: string; customData?: { componentType?: string } & Record<string, unknown> };
    targetElement: { id: string; customData?: { componentType?: string } & Record<string, unknown> };
    onSave: (config: ConnectionConfig) => void;
    onCancel: () => void;
}

const PROTOCOL_OPTIONS = [
    {
        value: 'http',
        label: 'HTTP/REST',
        description: 'Standard synchronous request-response. Best for simple APIs.',
        icon: Globe,
    },
    {
        value: 'grpc',
        label: 'gRPC',
        description: 'High-performance RPC with Protocol Buffers. Great for microservices.',
        icon: Zap,
    },
    {
        value: 'amqp',
        label: 'Message Queue',
        description: 'Asynchronous messaging. Ideal for decoupling and reliability.',
        icon: MessageSquare,
    },
];

export function ConnectionConfigModal({
    isOpen,
    sourceElement,
    targetElement,
    onSave,
    onCancel,
}: ConnectionConfigModalProps) {
    const [protocol, setProtocol] = useState<Protocol>('http');
    const [throughputQps, setThroughputQps] = useState(1000);
    const [showDataContract, setShowDataContract] = useState(false);
    const [requestFormat, setRequestFormat] = useState('');
    const [responseFormat, setResponseFormat] = useState('');

    if (!isOpen) return null;

    const sourceData = sourceElement.customData as SystemComponentData | undefined;
    const targetData = targetElement.customData as SystemComponentData | undefined;
    const sourceTemplate = sourceData?.componentType
        ? getComponentTemplate(sourceData.componentType)
        : null;
    const targetTemplate = targetData?.componentType
        ? getComponentTemplate(targetData.componentType)
        : null;

    const handleSave = () => {
        const config: ConnectionConfig = {
            protocol,
            throughput_qps: throughputQps,
        };

        if (showDataContract && (requestFormat || responseFormat)) {
            config.data_contract = {
                request_format: requestFormat || undefined,
                response_format: responseFormat || undefined,
            };
        }

        onSave(config);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onCancel}
            />

            {/* Modal */}
            <div className="relative bg-[var(--color-panel-bg)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in zoom-in-95 fade-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
                    <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
                        Configure Connection
                    </h2>
                    <button
                        onClick={onCancel}
                        className="p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] rounded-lg transition-all"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Connection Visual */}
                <div className="px-5 py-4 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                    <div className="flex items-center justify-center gap-3">
                        {/* Source */}
                        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-panel-bg)] border border-[var(--color-border)] rounded-lg">
                            <span className="text-xl">{sourceTemplate?.icon || '📦'}</span>
                            <span className="text-sm font-medium text-[var(--color-text-primary)]">
                                {sourceTemplate?.label || 'Source'}
                            </span>
                        </div>

                        {/* Arrow */}
                        <ArrowRight className="h-5 w-5 text-[var(--color-primary)]" />

                        {/* Target */}
                        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-panel-bg)] border border-[var(--color-border)] rounded-lg">
                            <span className="text-xl">{targetTemplate?.icon || '📦'}</span>
                            <span className="text-sm font-medium text-[var(--color-text-primary)]">
                                {targetTemplate?.label || 'Target'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Form Content */}
                <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {/* Protocol Selection */}
                    <RadioField
                        label="Protocol"
                        value={protocol}
                        options={PROTOCOL_OPTIONS.map(opt => ({
                            value: opt.value,
                            label: opt.label,
                            description: opt.description,
                        }))}
                        onChange={(val) => setProtocol(val as Protocol)}
                    />

                    {/* Throughput */}
                    <NumberField
                        label="Expected Throughput"
                        value={throughputQps}
                        unit="QPS"
                        onChange={setThroughputQps}
                        helpText="Queries per second this connection handles."
                    />

                    {/* Data Contract (collapsible) */}
                    <div className="space-y-2">
                        <button
                            type="button"
                            onClick={() => setShowDataContract(!showDataContract)}
                            className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider hover:text-[var(--color-primary)] transition-colors"
                        >
                            <span className={`transform transition-transform ${showDataContract ? 'rotate-90' : ''}`}>
                                ▶
                            </span>
                            Data Contract (Optional)
                        </button>

                        {showDataContract && (
                            <div className="space-y-3 pl-4 border-l-2 border-[var(--color-border)]">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                                        Request Format
                                    </label>
                                    <textarea
                                        value={requestFormat}
                                        onChange={(e) => setRequestFormat(e.target.value)}
                                        placeholder='{"userId": "string", "action": "string"}'
                                        rows={3}
                                        className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent resize-none font-mono"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                                        Response Format
                                    </label>
                                    <textarea
                                        value={responseFormat}
                                        onChange={(e) => setResponseFormat(e.target.value)}
                                        placeholder='{"success": "boolean", "data": "object"}'
                                        rows={3}
                                        className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent resize-none font-mono"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-panel-bg)] rounded-lg transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-5 py-2 text-sm font-semibold text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded-lg transition-all shadow-md hover:shadow-lg"
                    >
                        Save Connection
                    </button>
                </div>
            </div>
        </div>
    );
}
