import { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import pool from "@/lib/db";
import { RowDataPacket } from "mysql2";
import bcrypt from "bcryptjs";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        // Rate limit by username
        const rateLimitKey = `login:${credentials.username}`;
        const limit = checkRateLimit(rateLimitKey);
        if (!limit.allowed) {
          throw new Error("Terlalu banyak percobaan login. Coba lagi dalam 15 menit.");
        }

        try {
          const [rows] = await pool.query<RowDataPacket[]>(
            "SELECT u.*, l.loket_code, l.nama as loket_name FROM users u LEFT JOIN lokets l ON u.loket_id = l.id WHERE u.username = ? LIMIT 1",
            [credentials.username]
          );

          const user = rows[0];
          if (!user) return null;

          const isValid = await bcrypt.compare(credentials.password, user.password);
          if (!isValid) return null;

          // Reset rate limit on successful login
          resetRateLimit(rateLimitKey);

          return {
            id: String(user.id),
            name: user.name || user.username,
            email: user.username,
            username: user.username,
            role: user.role,
            loketCode: user.loket_code || null,
            loketName: user.loket_name || null,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.name = (user as { name?: string }).name || (user as { username?: string }).username || token.name;
        token.role = (user as { role?: string }).role;
        token.username = (user as { username?: string; email?: string }).username || (user as { email?: string }).email;
        token.loketCode = (user as { loketCode?: string }).loketCode;
        token.loketName = (user as { loketName?: string }).loketName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = session.user.name || (token.name as string) || (token.username as string) || (session.user.email ?? "");
        session.user.email = session.user.email || (token.username as string) || null;
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { id?: string }).id = token.sub;
        (session.user as { username?: string }).username = (token.username as string) || session.user.email || undefined;
        (session.user as { loketCode?: string }).loketCode = token.loketCode as string;
        (session.user as { loketName?: string }).loketName = token.loketName as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
};
