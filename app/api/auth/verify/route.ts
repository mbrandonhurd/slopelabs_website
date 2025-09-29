export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const { token, email } = await req.json().catch(() => ({}));
  if (!token || !email) return NextResponse.json({ ok: false }, { status: 400 });

  const vt = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token } },
  });
  if (!vt || vt.expires < new Date()) return NextResponse.json({ ok: false }, { status: 400 });

  await prisma.user.update({ where: { email }, data: { emailVerified: new Date() } });
  await prisma.verificationToken.delete({
    where: { identifier_token: { identifier: email, token } },
  });
  return NextResponse.json({ ok: true });
}
