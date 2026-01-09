import { LandingPage } from "@/components/landing/LandingPage";

// Server component wrapper - prevents prerendering issues
export const dynamic = "force-dynamic";

export default function HomePage() {
  return <LandingPage />;
}
