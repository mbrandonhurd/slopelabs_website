// middleware.ts
export { default } from "next-auth/middleware";

// Only protect your app pages. Leave /, /login, *all* /api/*, and static assets public.
export const config = {
  matcher: [
    "/r/:path*",      // dashboards
    "/admin/:path*",  // admin
  ],
};
