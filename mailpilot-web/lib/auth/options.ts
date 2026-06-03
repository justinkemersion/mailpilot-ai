import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";

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
    GoogleProvider({
      clientId: optionalEnv("GOOGLE_CLIENT_ID"),
      clientSecret: optionalEnv("GOOGLE_CLIENT_SECRET"),
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.provider && account.providerAccountId) {
        token.mailpilotUserId = `${account.provider}:${account.providerAccountId}`;
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
