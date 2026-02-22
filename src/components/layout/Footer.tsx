"use client";

import Link from "next/link";
import { Code2 } from "lucide-react";
import { SiDiscord } from "react-icons/si";

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
              Design, simulate, and learn distributed systems on a visual canvas.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-8 text-sm">
            <div className="flex flex-col gap-2">
              <h4 className="font-medium text-[var(--color-text-primary)]">Product</h4>
              <Link href="/sandbox" className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors">
                Sandbox
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
              href="https://discord.gg/cxPZAx4tng"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[#5865F2] hover:bg-[var(--color-surface)] transition-colors"
              aria-label="Discord"
            >
              <SiDiscord className="h-5 w-5" />
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

