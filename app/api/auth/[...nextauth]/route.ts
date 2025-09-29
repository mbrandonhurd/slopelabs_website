// app/api/auth/[...nextauth]/route.ts
export const runtime = "nodejs";

import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";


const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };

const passwordHash = await bcrypt.hash(password, 12); // 10–12 rounds recommended
