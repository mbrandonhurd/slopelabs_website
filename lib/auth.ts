import { SignJWT, jwtVerify } from "jose";
const secret = new TextEncoder().encode(process.env.AUTH_JWT_SECRET || "dev-secret-change-me");
export async function createSession(subject: string, role: "public" | "pro" | "admin" = "pro") {
  const token = await new SignJWT({ sub: subject, role }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(secret);
  return token;
}
export async function verifySession(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as { sub: string; role: "public" | "pro" | "admin" };
  } catch { return null; }
}
