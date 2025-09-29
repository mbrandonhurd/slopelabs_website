// middleware.ts
export { default } from "next-auth/middleware";

// Only gate your app pages; leave /, /login, /api/auth/*, static assets public.
export const config = {
  matcher: [
    "/r/:path*",      // dashboards
    "/admin/:path*",  // admin
  ],
};
