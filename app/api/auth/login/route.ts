import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
export async function POST(req: Request) {
  const { role } = await req.json();
  const token = await createSession("demo-user", role || "pro");
  cookies().set("session", token, { httpOnly: true, sameSite: "lax", secure: true, path: "/" });
  return NextResponse.json({ ok: true, role });
}
