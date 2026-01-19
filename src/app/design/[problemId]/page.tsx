'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

// Dynamically import the canvas to avoid SSR issues with Excalidraw
const SystemDesignCanvas = dynamic(
    () => import('@/components/canvas/SystemDesignCanvas'),
    { ssr: false, loading: () => <CanvasLoading /> }
);

function CanvasLoading() {
    return (
        <div className="flex items-center justify-center h-full bg-gray-50">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading design canvas...</p>
            </div>
        </div>
    );
}

export default function DesignPage() {
    const params = useParams();
    const problemId = params.problemId as string;

    return (
        <div className="h-screen overflow-hidden">
            {/* Header */}
            <header className="h-14 border-b border-gray-200 bg-white flex items-center px-4 justify-between">
                <div className="flex items-center gap-4">
                    <h1 className="text-lg font-semibold text-gray-800">
                        System Design Canvas
                    </h1>
                    <span className="text-sm text-gray-500">
                        Problem: {problemId}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {/* Placeholder for Run Simulation button */}
                </div>
            </header>

            {/* Canvas Area - explicit height calculation */}
            <main style={{ height: 'calc(100vh - 56px)' }} className="relative">
                <SystemDesignCanvas problemId={problemId} />
            </main>
        </div>
    );
}

