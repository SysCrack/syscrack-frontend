import { ProblemsPage } from "./ProblemsPage";

// Server component wrapper - prevents prerendering issues
export const dynamic = "force-dynamic";

export default function Page() {
  return <ProblemsPage />;
}
