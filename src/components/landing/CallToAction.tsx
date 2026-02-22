"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";

export function CallToAction() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="relative rounded-2xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-hover)] p-8 sm:p-12 text-center overflow-hidden">
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />

          <div className="relative">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              Ready to design systems?
            </h2>
            <p className="text-white/80 text-lg mb-8 max-w-xl mx-auto">
              Jump into the sandbox and build architectures. 
              Simulate traffic, spot SPOFs, and learn what scales.
            </p>
            <Link href="/auth/signup">
              <Button
                size="lg"
                className="bg-white text-[var(--color-primary)] hover:bg-white/90 min-w-[200px] group"
              >
                Get Started
                <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

