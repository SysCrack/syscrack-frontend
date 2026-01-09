import { SignUpForm } from "./SignUpForm";

// Server component wrapper - prevents prerendering issues
export const dynamic = "force-dynamic";

export default function SignUpPage() {
  return <SignUpForm />;
}
