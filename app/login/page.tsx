// app/login/page.tsx
import LoginClient from "./LoginClient";

function sanitizeCallback(raw?: string | null) {
  if (!raw || !raw.startsWith("/")) return "/r/south_rockies";
  if (raw.startsWith("/_next") || raw.startsWith("/api/") || raw.endsWith(".svg")) {
    return "/r/south_rockies";
  }
  return raw;
}

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { callbackUrl?: string };
}) {
  const callbackUrl = sanitizeCallback(searchParams?.callbackUrl);
  return <LoginClient callbackUrl={callbackUrl} />;
}
