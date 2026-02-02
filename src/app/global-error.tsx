"use client";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html>
            <body>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
                    <h2>Something went wrong!</h2>
                    <button onClick={() => reset()}>Try again</button>
                </div>
            </body>
        </html>
    );
}
