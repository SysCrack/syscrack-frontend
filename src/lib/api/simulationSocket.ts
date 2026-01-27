/**
 * WebSocket client for real-time simulation updates
 * 
 * Connects to WebSocket endpoint for live simulation progress.
 * Falls back to polling if WebSocket connection fails.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useSimulationStore } from '@/stores/simulationStore';
import { SimulationStatus } from '@/lib/types/design';
import type { ScenarioResult, GradingResult, EstimationComparison } from '@/lib/types/design';
import * as simulationsApi from '@/lib/api/simulations';

const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';

// Event types from WebSocket
interface ProgressEvent {
    type: 'progress';
    percent: number;
    current_scenario: string;
}

interface ScenarioCompleteEvent {
    type: 'scenario_complete';
    scenario: string;
    result: ScenarioResult;
}

interface CompleteEvent {
    type: 'complete';
    results: ScenarioResult[];
    total_score: number;
    grading_result?: GradingResult;
    estimation_comparison?: EstimationComparison;
}

interface ErrorEvent {
    type: 'error';
    message: string;
}

type SimulationEvent = ProgressEvent | ScenarioCompleteEvent | CompleteEvent | ErrorEvent;

interface UseSimulationStreamReturn {
    progress: number;
    currentScenario: string | null;
    isConnected: boolean;
    latestEvent: SimulationEvent | null;
    connectionError: string | null;
}

/**
 * Exponential backoff calculator
 */
function getBackoffDelay(attempt: number, maxDelay = 30000): number {
    const baseDelay = 1000;
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    // Add jitter
    return delay + Math.random() * 1000;
}

/**
 * Hook for real-time simulation updates via WebSocket
 * 
 * Automatically connects when jobId is provided.
 * Falls back to polling if WebSocket fails after max retries.
 */
export function useSimulationStream(jobId: string | null): UseSimulationStreamReturn {
    const [progress, setProgress] = useState(0);
    const [currentScenario, setCurrentScenario] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [latestEvent, setLatestEvent] = useState<SimulationEvent | null>(null);
    const [connectionError, setConnectionError] = useState<string | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectAttemptRef = useRef(0);
    const maxReconnectAttempts = 5;
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const usingPollingRef = useRef(false);

    // Store actions
    const updateProgress = useSimulationStore((state) => state.updateProgress);
    const setResults = useSimulationStore((state) => state.setResults);
    const setError = useSimulationStore((state) => state.setError);

    /**
     * Handle incoming WebSocket message
     */
    const handleMessage = useCallback((event: MessageEvent) => {
        try {
            const data: SimulationEvent = JSON.parse(event.data);
            setLatestEvent(data);

            switch (data.type) {
                case 'progress':
                    setProgress(data.percent);
                    setCurrentScenario(data.current_scenario);
                    updateProgress(data.percent, data.current_scenario);
                    break;

                case 'scenario_complete':
                    // Could update partial results here if needed
                    console.log('Scenario complete:', data.scenario);
                    break;

                case 'complete':
                    setProgress(100);
                    setResults(
                        data.results,
                        data.total_score,
                        data.grading_result,
                        data.estimation_comparison
                    );
                    // Close connection after completion
                    wsRef.current?.close();
                    break;

                case 'error':
                    setError(data.message);
                    wsRef.current?.close();
                    break;
            }
        } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
        }
    }, [updateProgress, setResults, setError]);

    /**
     * Start polling as fallback
     */
    const startPolling = useCallback(() => {
        if (!jobId || usingPollingRef.current) return;

        console.log('WebSocket failed, falling back to polling');
        usingPollingRef.current = true;

        pollingIntervalRef.current = setInterval(async () => {
            try {
                const response = await simulationsApi.getSimulationStatus(jobId);

                if (response.status === SimulationStatus.COMPLETED) {
                    if (pollingIntervalRef.current) {
                        clearInterval(pollingIntervalRef.current);
                    }
                    setProgress(100);
                    setResults(
                        response.results || [],
                        response.total_score || 0,
                        response.grading_result,
                        response.estimation_comparison
                    );
                } else if (response.status === SimulationStatus.FAILED) {
                    if (pollingIntervalRef.current) {
                        clearInterval(pollingIntervalRef.current);
                    }
                    setError(response.error || 'Simulation failed');
                } else {
                    // Increment progress locally
                    setProgress(prev => Math.min(90, prev + 5));

                    // Update store with latest progress
                    const currentStoreProgress = useSimulationStore.getState().progress;
                    updateProgress(Math.min(90, currentStoreProgress + 5));
                }
            } catch (err) {
                console.error('Polling error:', err);
            }
        }, 1000);
    }, [jobId, updateProgress, setResults, setError]); // Removed progress dependency

    /**
     * Connect to WebSocket
     */
    const connect = useCallback(() => {
        if (!jobId) return;

        // Clean up existing connection
        if (wsRef.current) {
            wsRef.current.close(1000, 'Intentional cleanup');
            wsRef.current = null;
        }

        const wsUrl = `${WS_BASE_URL}/simulations/${jobId}/stream`;
        console.log('Connecting to WebSocket:', wsUrl);

        try {
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('WebSocket connected');
                setIsConnected(true);
                setConnectionError(null);
                reconnectAttemptRef.current = 0;
            };

            ws.onmessage = handleMessage;

            ws.onerror = (error) => {
                // WebSocket errors are often logged as empty objects by browsers
                console.warn('WebSocket connection errored:', error);
                setConnectionError('WebSocket error occurred');
            };

            ws.onclose = (event) => {
                console.log('WebSocket closed:', event.code, event.reason);
                setIsConnected(false);

                // Don't reconnect if completed or intentionally closed
                if (event.code === 1000 || event.code === 1001) {
                    return;
                }

                // Attempt reconnection with exponential backoff
                if (reconnectAttemptRef.current < maxReconnectAttempts) {
                    const delay = getBackoffDelay(reconnectAttemptRef.current);
                    console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current + 1})`);

                    reconnectTimeoutRef.current = setTimeout(() => {
                        reconnectAttemptRef.current++;
                        connect();
                    }, delay);
                } else {
                    // Fall back to polling after max reconnect attempts
                    setConnectionError('WebSocket connection failed, using polling');
                    startPolling();
                }
            };
        } catch (err) {
            console.error('Failed to create WebSocket:', err);
            setConnectionError('Failed to connect');
            startPolling();
        }
    }, [jobId, handleMessage, startPolling]);

    /**
     * Effect to connect when jobId changes
     */
    useEffect(() => {
        if (jobId) {
            // Reset state
            setProgress(0);
            setCurrentScenario(null);
            setLatestEvent(null);
            setConnectionError(null);
            reconnectAttemptRef.current = 0;
            usingPollingRef.current = false;

            connect();
        }

        return () => {
            // Cleanup
            if (wsRef.current) {
                wsRef.current.close(1000, 'Component unmounted');
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
        };
    }, [jobId, connect]);

    return {
        progress,
        currentScenario,
        isConnected,
        latestEvent,
        connectionError,
    };
}

/**
 * Direct WebSocket connection class for non-hook usage
 */
export class SimulationSocket {
    private ws: WebSocket | null = null;
    private jobId: string;
    private onProgress?: (percent: number, scenario: string) => void;
    private onComplete?: (results: ScenarioResult[], totalScore: number) => void;
    private onError?: (message: string) => void;

    constructor(
        jobId: string,
        callbacks: {
            onProgress?: (percent: number, scenario: string) => void;
            onComplete?: (results: ScenarioResult[], totalScore: number) => void;
            onError?: (message: string) => void;
        }
    ) {
        this.jobId = jobId;
        this.onProgress = callbacks.onProgress;
        this.onComplete = callbacks.onComplete;
        this.onError = callbacks.onError;
    }

    connect(): void {
        const wsUrl = `${WS_BASE_URL}/simulations/${this.jobId}/stream`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);

            switch (data.type) {
                case 'progress':
                    this.onProgress?.(data.percent, data.current_scenario);
                    break;
                case 'complete':
                    this.onComplete?.(data.results, data.total_score);
                    break;
                case 'error':
                    this.onError?.(data.message);
                    break;
            }
        };

        this.ws.onerror = () => {
            this.onError?.('WebSocket connection error');
        };
    }

    disconnect(): void {
        this.ws?.close(1000);
    }
}
