import { LoginForm } from "./LoginForm";

// Server component wrapper - prevents prerendering issues
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm />;
}
