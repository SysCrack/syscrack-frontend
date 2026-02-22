"use client";

import { User, Award, Target, Flame, Calendar } from "lucide-react";
import { TopNav } from "@/components/layout/TopNav";
import { Card, Button } from "@/components/ui";
import { useUser } from "@/lib/hooks/useUser";
import { useAuthStore } from "@/stores/authStore";
import { useRouter } from "next/navigation";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  description?: string;
}

function StatCard({ icon, label, value, description }: StatCardProps) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-[var(--color-primary-light)] text-[var(--color-primary)]">
          {icon}
        </div>
        <span className="text-sm font-medium text-[var(--color-text-secondary)]">
          {label}
        </span>
      </div>
      <div className="text-3xl font-bold text-[var(--color-text-primary)]">
        {value}
      </div>
      {description && (
        <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
          {description}
        </p>
      )}
    </Card>
  );
}

export function ProfilePage() {
  const router = useRouter();
  const { user: authUser, isLoading: authLoading } = useAuthStore();
  const { data: profile, isLoading: profileLoading } = useUser();

  const isLoading = authLoading || profileLoading;

  // Redirect to login if not authenticated
  if (!authLoading && !authUser) {
    router.push("/auth/login");
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--color-canvas-bg)]">
        <TopNav />
        <main className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-canvas-bg)]">
      <TopNav />

      <main className="flex-1 py-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          {/* Profile Header */}
          <div className="bg-[var(--color-panel-bg)] border border-[var(--color-border)] rounded-xl p-8 mb-8">
            <div className="flex items-start gap-6">
              {/* Avatar */}
              <div className="flex-shrink-0">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Profile"
                    className="w-24 h-24 rounded-full object-cover border-4 border-[var(--color-border)]"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center border-4 border-[var(--color-border)]">
                    <User className="w-12 h-12 text-[var(--color-primary)]" />
                  </div>
                )}
              </div>

              {/* User Info */}
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-[var(--color-text-primary)] truncate">
                  {profile?.display_name || "Anonymous User"}
                </h1>
                <p className="text-[var(--color-text-secondary)] mt-1">
                  {profile?.email || authUser?.email}
                </p>
                {profile?.bio && (
                  <p className="text-[var(--color-text-secondary)] mt-3 text-sm">
                    {profile.bio}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-4 text-sm text-[var(--color-text-tertiary)]">
                  <Calendar className="w-4 h-4" />
                  <span>
                    Member since{" "}
                    {profile?.created_at
                      ? new Date(profile.created_at).toLocaleDateString("en-US", {
                          month: "long",
                          year: "numeric",
                        })
                      : "Unknown"}
                  </span>
                </div>
              </div>

              {/* Edit Button */}
              <Button variant="outline" size="sm">
                Edit Profile
              </Button>
            </div>
          </div>

          {/* Stats Grid */}
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-4">
            Statistics
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              icon={<Target className="w-5 h-5" />}
              label="Problems Solved"
              value={profile?.problems_solved ?? 0}
              description="Unique problems"
            />
            <StatCard
              icon={<Award className="w-5 h-5" />}
              label="Total Score"
              value={profile?.total_score ?? 0}
              description="Cumulative points"
            />
            <StatCard
              icon={<Flame className="w-5 h-5" />}
              label="Current Streak"
              value={`${profile?.streak_days ?? 0} days`}
              description={profile?.streak_days && profile.streak_days > 0 ? "Keep it up!" : "Start your streak today!"}
            />
            <StatCard
              icon={<User className="w-5 h-5" />}
              label="Account Type"
              value={profile?.is_premium ? "Premium" : "Free"}
              description={profile?.is_premium ? "Full access" : "Limited features"}
            />
          </div>

          {/* Submission History Placeholder */}
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-4">
            Recent Submissions
          </h2>
          <div className="bg-[var(--color-surface)] border-2 border-dashed border-[var(--color-border)] rounded-xl p-12 text-center">
            <Award className="h-12 w-12 text-[var(--color-text-tertiary)] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
              Submission History Coming Soon
            </h3>
            <p className="text-[var(--color-text-secondary)] max-w-md mx-auto">
              Your submission history will appear here once you start solving problems.
            </p>
            <Button className="mt-6" onClick={() => router.push("/")}>
              Go to Home
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
