import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-canvas-bg)] px-4">
      <h1 className="text-6xl font-bold text-[var(--color-text-primary)] mb-4">
        404
      </h1>
      <h2 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-2">
        Page Not Found
      </h2>
      <p className="text-[var(--color-text-secondary)] mb-8 text-center max-w-md">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="px-6 py-3 bg-[var(--color-primary)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
      >
        Go Home
      </Link>
    </div>
  );
}
