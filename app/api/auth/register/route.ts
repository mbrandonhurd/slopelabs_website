export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import argon2 from "argon2";
import { z } from "zod";
// optional mailer:
import nodemailer from "nodemailer";
import crypto from "node:crypto";

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const { email, password, name } = parsed.data;

  // prevent takeover: if existing user with Google SSO but no password, allow linking via same email
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.passwordHash) {
    return NextResponse.json({ ok: false, error: "Email already in use" }, { status: 409 });
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  let user;
  if (!existing) {
    user = await prisma.user.create({
      data: { email, name: name ?? null, passwordHash, emailVerified: null },
    });
  } else {
    user = await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, name: existing.name ?? name ?? null },
    });
  }

  // OPTIONAL: email verification flow (skip if you don’t need it now)
  // Create a verification token in the NextAuth VerificationToken table
  if (process.env.EMAIL_SERVER && process.env.EMAIL_FROM) {
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h
    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token,
        expires,
      },
    });
    const verifyUrl = `${process.env.NEXTAUTH_URL}/login/verify?token=${token}&email=${encodeURIComponent(email)}`;
    const transporter = nodemailer.createTransport(process.env.EMAIL_SERVER!);
    await transporter.sendMail({
      to: email,
      from: process.env.EMAIL_FROM!,
      subject: "Verify your email",
      text: `Click to verify: ${verifyUrl}`,
      html: `<p>Click to verify: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
    });
  } else {
    // If you’re not doing email verification, you may choose to set:
    // await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
  }

  return NextResponse.json({ ok: true });
}
