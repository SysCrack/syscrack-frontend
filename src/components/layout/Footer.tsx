"use client";

import Link from "next/link";
import { Code2, Github, Twitter } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-panel-bg)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          {/* Brand */}
          <div className="flex flex-col gap-3">
            <Link href="/" className="flex items-center gap-2 text-[var(--color-text-primary)]">
              <Code2 className="h-6 w-6 text-[var(--color-primary)]" />
              <span className="text-lg font-semibold">Syscrack</span>
            </Link>
            <p className="text-sm text-[var(--color-text-secondary)] max-w-xs">
              Master SQL performance with hands-on practice and instant feedback.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-8 text-sm">
            <div className="flex flex-col gap-2">
              <h4 className="font-medium text-[var(--color-text-primary)]">Product</h4>
              <Link href="/problems" className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors">
                Problems
              </Link>
              <Link href="/pricing" className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors">
                Pricing
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              <h4 className="font-medium text-[var(--color-text-primary)]">Company</h4>
              <Link href="/about" className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors">
                About
              </Link>
              <Link href="/contact" className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors">
                Contact
              </Link>
            </div>
          </div>

          {/* Social */}
          <div className="flex items-center gap-3">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
              aria-label="GitHub"
            >
              <Github className="h-5 w-5" />
            </a>
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
              aria-label="Twitter"
            >
              <Twitter className="h-5 w-5" />
            </a>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-8 pt-8 border-t border-[var(--color-border)]">
          <p className="text-sm text-[var(--color-text-tertiary)] text-center">
            © {currentYear} Syscrack. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

