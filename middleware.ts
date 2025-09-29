// Only protect the app pages that should require SSO.
// This leaves `/`, `/login`, *all* `/api/auth/*`, and static assets public.
export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/r/:path*",      // your region dashboard(s)
    "/admin/:path*",  // admin area
    // Add more when you add new top-level protected sections, e.g.:
    // "/models/:path*",
    // "/reports/:path*",
  ],
};
