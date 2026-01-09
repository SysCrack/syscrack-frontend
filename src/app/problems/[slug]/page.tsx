import { ProblemDetailPage } from "./ProblemDetailPage";

// Server component wrapper - prevents prerendering issues
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function Page({ params }: PageProps) {
  return <ProblemDetailPage params={params} />;
}
