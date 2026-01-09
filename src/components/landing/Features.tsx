"use client";

import { Database, Zap, TrendingUp, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui";

const features = [
  {
    icon: Database,
    title: "Practice Real SQL",
    description:
      "Write actual PostgreSQL queries executed against real databases. No simulations, just authentic database experience.",
  },
  {
    icon: Zap,
    title: "Instant Feedback",
    description:
      "Get immediate results with execution times, query plans, and optimization suggestions to improve your skills.",
  },
  {
    icon: TrendingUp,
    title: "Track Progress",
    description:
      "Monitor your improvement with scores, streaks, and completion stats. See your SQL skills grow over time.",
  },
  {
    icon: Shield,
    title: "Safe Environment",
    description:
      "Each query runs in an isolated container. Experiment freely without worrying about breaking anything.",
  },
];

export function Features() {
  return (
    <section className="py-20 sm:py-28 bg-[var(--color-panel-bg)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-[var(--color-text-primary)]">
            Everything you need to master SQL
          </h2>
          <p className="mt-4 text-lg text-[var(--color-text-secondary)] max-w-2xl mx-auto">
            From basic queries to complex optimizations, we have the tools to level up your database skills.
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

