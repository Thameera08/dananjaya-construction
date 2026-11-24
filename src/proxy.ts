import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/**
 * Optimistic auth gate (Next 16 `proxy`, formerly middleware): redirects signed-out
 * visitors to /login. Real authorization happens in the DAL (src/lib/dal.ts) on every
 * page, Server Action and Route Handler.
 */
const { auth } = NextAuth(authConfig);
export default auth;

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
