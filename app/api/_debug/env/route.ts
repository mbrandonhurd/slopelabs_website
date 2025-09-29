export const runtime = "nodejs";
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    GOOGLE_CLIENT_ID_present: Boolean(process.env.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET_present: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    NEXTAUTH_SECRET_present: Boolean(process.env.NEXTAUTH_SECRET),
  });
}
