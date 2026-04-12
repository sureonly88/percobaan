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

          // Block pending / rejected users from logging in
          if (user.status === "pending") {
            throw new Error("Akun Anda masih menunggu persetujuan admin. Silakan tunggu konfirmasi.");
          }
          if (user.status === "ditolak") {
            const note = user.catatan_tolak ? ` Alasan: ${user.catatan_tolak}` : "";
            throw new Error(`Pendaftaran Anda tidak disetujui.${note}`);
          }
          if (user.status === "nonaktif") {
            throw new Error("Akun Anda telah dinonaktifkan. Hubungi admin loket Anda.");
          }

          // Reset rate limit on successful login
          resetRateLimit(rateLimitKey);

          return {
            id: String(user.id),
            name: user.name || user.username,
            email: user.username,
            username: user.username,
            role: user.role,
            loketId: user.loket_id || null,
            loketCode: user.loket_code || null,
            loketName: user.loket_name || null,
            isLoketAdmin: user.is_loket_admin === 1,
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
        token.loketId = (user as { loketId?: number | null }).loketId ?? null;
        token.loketCode = (user as { loketCode?: string }).loketCode;
        token.loketName = (user as { loketName?: string }).loketName;
        token.isLoketAdmin = (user as { isLoketAdmin?: boolean }).isLoketAdmin ?? false;
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
        (session.user as { loketId?: number | null }).loketId = token.loketId as number | null;
        (session.user as { loketCode?: string }).loketCode = token.loketCode as string;
        (session.user as { loketName?: string }).loketName = token.loketName as string;
        (session.user as { isLoketAdmin?: boolean }).isLoketAdmin = token.isLoketAdmin as boolean ?? false;
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
