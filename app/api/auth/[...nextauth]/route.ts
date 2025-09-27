export const runtime = "nodejs";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Email from "next-auth/providers/email";

// TEMP LOGS — remove after verifying
console.log("GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID);
console.log("GOOGLE_CLIENT_SECRET set:", !!process.env.GOOGLE_CLIENT_SECRET);

export const authOptions = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    process.env.EMAIL_SERVER && process.env.EMAIL_FROM
      ? Email({ server: process.env.EMAIL_SERVER, from: process.env.EMAIL_FROM })
      : (null as any),
  ].filter(Boolean),
  session: { strategy: "jwt" as const },
  pages: { signIn: "/login" },
  debug: true, // extra logs in terminal
};
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
