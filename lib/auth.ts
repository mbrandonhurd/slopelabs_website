import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";

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

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  // TEMP while debugging
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

          // Optional: enforce verified email
          // if (!user.emailVerified) { console.warn("[Credentials] email not verified", { email }); return null; }

          const ok = await bcrypt.compare(password, user.passwordHash);
          if (!ok) {
            console.warn("[Credentials] bad password", { email });
            return null;
          }

          console.info("[Credentials] success", { userId: user.id, email: user.email });
          return { id: user.id, email: user.email, name: user.name, image: user.image };
        } catch (err) {
          console.error("[Credentials] authorize error:", err);
          return null; // -> ?error=CredentialsSignin
        }
      },
    }),
  ],

  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    async jwt({ token, user, account }) {
      // Persist DB user id into the token (if available)
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email },
          select: { id: true },
        });
        if (dbUser?.id) (token as any).uid = dbUser.id;
      }
      // Keep provider subject for reference
      if (account?.provider && token.sub) {
        (token as any).providerSub = `${account.provider}:${token.sub}`;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        // Prefer DB id, fall back to provider subject
        (session.user as any).id = (token as any).uid || token.sub;
        (session.user as any).providerSub = (token as any).providerSub;
      }
      return session;
    },

    // Optional: see every sign-in decision (OAuth + Credentials)
    async signIn({ user, account, email }) {
      console.info("[NextAuth] signIn callback", {
        provider: account?.provider,
        userId: user?.id,
        email: user?.email ?? email,
      });
      return true;
    },
  },

  // NextAuth v4 logger signatures
  logger: {
    error(code, ...meta) {
      console.error("[NextAuth][error]", code, ...meta);
    },
    warn(code) {
      console.warn("[NextAuth][warn]", code);
    },
    debug(code, ...meta) {
      console.debug("[NextAuth][debug]", code, ...meta);
    },
  },

  events: {
    async signIn(msg) {
      console.info("[NextAuth event] signIn", {
        provider: msg.account?.provider,
        userId: msg.user?.id,
        email: msg.user?.email,
        isNewUser: msg.isNewUser,
      });
    },
    async createUser(msg) {
      console.info("[NextAuth event] createUser", {
        userId: msg.user.id,
        email: msg.user.email,
      });
    },
  },
};
