import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

function optionalEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  providers: [
    GitHubProvider({
      clientId: optionalEnv("AUTH_GITHUB_ID"),
      clientSecret: optionalEnv("AUTH_GITHUB_SECRET"),
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.providerAccountId) {
        token.mailpilotUserId = `github:${account.providerAccountId}`;
      }
      return token;
    },
    async session({ session, token }) {
      const userId = token.mailpilotUserId;
      if (session.user && typeof userId === "string") {
        session.user.id = userId;
      }
      return session;
    },
  },
};
