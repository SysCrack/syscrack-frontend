/**
 * Sandbox route: force dynamic rendering so client-only simulation store
 * and worker are not run during static prerender.
 */
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export default function SandboxLayout({
    children,
}: {
    children: ReactNode;
}) {
    return children;
}
