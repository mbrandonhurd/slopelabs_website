import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import argon2 from "argon2";

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

// TEMP: print critical env presence at init time (no secrets)
console.info("[auth:init]", {
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  HAS_SECRET: !!process.env.NEXTAUTH_SECRET,
  HAS_DB: !!process.env.DATABASE_URL,
  HAS_GOOGLE_ID: !!process.env.GOOGLE_CLIENT_ID,
  HAS_GOOGLE_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
});

// keep this too
// debug: true + logger already added in your config



export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  // 🔎 TEMP: enable verbose logs in your server terminal / Vercel function logs
  debug: true,

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    Credentials({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        try {
          const parsed = CredentialsSchema.safeParse(raw);
          if (!parsed.success) {
            console.warn("[Credentials] invalid payload");
            return null;
          }
          const { email, password } = parsed.data;

          const user = await prisma.user.findUnique({ where: { email } });
          if (!user?.passwordHash) {
            console.warn("[Credentials] user not found or no passwordHash", { email });
            return null;
          }

          // Optional: require verified email
          // if (!user.emailVerified) { console.warn("[Credentials] email not verified", { email }); return null; }

          const ok = await argon2.verify(user.passwordHash, password);
          if (!ok) {
            console.warn("[Credentials] bad password", { email });
            return null;
          }

          console.info("[Credentials] success", { userId: user.id, email: user.email });
          return { id: user.id, email: user.email, name: user.name, image: user.image };
        } catch (err) {
          console.error("[Credentials] authorize error:", err);
          // returning null turns into ?error=CredentialsSignin (no 500)
          return null;
        }
      },
    }),
  ],

  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
    error: "/login", // route NextAuth errors to your login page
  },

  callbacks: {
    async session({ session, token }) {
      if (session.user) (session.user as any).id = token.sub;
      return session;
    },
    // 🔎 Optional: see every sign-in decision (OAuth + Credentials)
    async signIn({ user, account, profile, email, credentials }) {
      console.info("[NextAuth] signIn callback", {
        provider: account?.provider,
        userId: user?.id,
        email: user?.email ?? email,
      });
      // Return true to allow, false to deny; you can add checks here (e.g., domain allowlist)
      return true;
    },
  },

  // ✅ Use logger (supported in v4) instead of events.error
    logger: {
    // error(code, ...metadata)
    error(code, ...metadata) {
      console.error("[NextAuth][error]", code, ...metadata);
    },
    // warn(code) — only one argument in v4 types
    warn(code) {
      console.warn("[NextAuth][warn]", code);
    },
    // debug(code, ...metadata)
    debug(code, ...metadata) {
      console.debug("[NextAuth][debug]", code, ...metadata);
    },
  },


  // 🔎 Supported events you can keep
  events: {
    async signIn(message) {
      console.info("[NextAuth event] signIn", {
        provider: message?.account?.provider,
        userId: message?.user?.id,
        email: message?.user?.email,
        isNewUser: message?.isNewUser,
      });
    },
    async createUser(message) {
      console.info("[NextAuth event] createUser", {
        userId: message.user.id,
        email: message.user.email,
      });
    },
  },
};
