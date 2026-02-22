"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--color-primary-light)]/30 to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[var(--color-primary)]/10 rounded-full blur-3xl" />
      </div>

      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-20 sm:py-32 text-center">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] text-sm font-medium">
          <Sparkles className="h-4 w-4" />
          <span>Design. Simulate. Learn.</span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-[var(--color-text-primary)] tracking-tight">
          Design Systems
          <span className="text-[var(--color-primary)]"> at Scale</span>
        </h1>

        {/* Subheadline */}
        <p className="mt-6 text-lg sm:text-xl text-[var(--color-text-secondary)] max-w-2xl mx-auto leading-relaxed">
          Build and simulate distributed architectures on a visual canvas. 
          Get real-time feedback on RPS, latency, cost, and Points of Failure (PoF) - 
          and learn what works before production.
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/auth/signup">
            <Button size="lg" className="min-w-[200px] group">
              Get Started Free
              <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
            </Button>
          </Link>
          <Link href="/sandbox">
            <Button variant="outline" size="lg" className="min-w-[200px]">
              Open Sandbox
            </Button>
          </Link>
        </div>

        {/* Social proof */}
        <p className="mt-8 text-sm text-[var(--color-text-tertiary)]">
          Join developers mastering system design
        </p>
      </div>
    </section>
  );
}

