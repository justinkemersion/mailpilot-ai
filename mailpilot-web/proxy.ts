import { withAuth } from "next-auth/middleware";
import { DEMO_COOKIE_NAME, isDemoFeatureEnabled } from "@/lib/demo";

export default withAuth({
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized: ({ req, token }) => {
      if (
        req.cookies.get(DEMO_COOKIE_NAME)?.value === "1" &&
        isDemoFeatureEnabled()
      ) {
        return true;
      }
      if (token) return true;
      return false;
    },
  },
});

export const config = {
  matcher: ["/dashboard/:path*", "/auth/google/:path*"],
};
