export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    '/((?!login|api/auth|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|images|$).*)',
  ],
};
