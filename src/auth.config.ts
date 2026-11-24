import type { UserRole } from "@/db/schema";
import type { NextAuthConfig } from "next-auth";

const PUBLIC_PATHS = ["/login", "/setup"];

/** Edge-safe config shared by the proxy and the full Auth.js instance (no DB / bcrypt here). */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.id === "string") session.user.id = token.id;
      if (token.role) session.user.role = token.role as UserRole;
      return session;
    },
  },
} satisfies NextAuthConfig;
