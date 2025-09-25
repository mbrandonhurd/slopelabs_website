import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const url = new URL(req.nextUrl);
  if (url.pathname.startsWith("/admin")) {
    const token = req.cookies.get("session")?.value;
    const session = await verifySession(token);
    if (!session || (session.role !== "admin" && session.role !== "pro")) {
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"]
};
