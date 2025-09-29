// middleware.ts
export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/r/:path*",      // dashboard
    "/admin/:path*",  // admin
  ],
};
