import { NextResponse } from "next/server";

/**
 * This is a stub. In production, use AWS SDK v3's @aws-sdk/s3-request-presigner
 * to return a short-lived signed URL for a given key.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  if (!url) return new NextResponse("Missing url", { status: 400 });
  // For demo, just echo back the same URL.
  return NextResponse.json({ signed: url, expiresIn: 900 });
}
