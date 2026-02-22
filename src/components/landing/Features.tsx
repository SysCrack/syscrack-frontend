"use client";

import { LayoutGrid, Zap, ShieldCheck, FlaskConical } from "lucide-react";
import { Card, CardContent } from "@/components/ui";

const features = [
  {
    icon: LayoutGrid,
    title: "Visual Canvas",
    description:
      "Drag-and-drop components — CDN, load balancers, API gateways, caches, databases, message queues — to design distributed architectures.",
  },
  {
    icon: Zap,
    title: "Real-Time Simulation",
    description:
      "See RPS, latency, cost, and live request flow. Adjust load and scaling to understand how your architecture behaves under stress.",
  },
  {
    icon: ShieldCheck,
    title: "Architecture Validation",
    description:
      "SPOF detection, connection diagnostics, and scaling awareness. Get actionable feedback on bottlenecks and resilience before you deploy.",
  },
  {
    icon: FlaskConical,
    title: "Safe Experimentation",
    description:
      "Run simulations client-side in the sandbox. Experiment with topology and config without production risk.",
  },
];

export function Features() {
  return (
    <section className="py-20 sm:py-28 bg-[var(--color-panel-bg)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-[var(--color-text-primary)]">
            Everything you need to design systems
          </h2>
          <p className="mt-4 text-lg text-[var(--color-text-secondary)] max-w-2xl mx-auto">
            From high-level architecture to scaling and resilience, build the skills that matter in distributed systems.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature) => (
            <Card key={feature.title} variant="interactive">
              <CardContent className="pt-6">
                <div className="mb-4 w-12 h-12 rounded-xl bg-[var(--color-primary-light)] flex items-center justify-center">
                  <feature.icon className="h-6 w-6 text-[var(--color-primary)]" />
                </div>
                <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

