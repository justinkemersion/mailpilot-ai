import { authOptions } from "@/lib/auth/options";
import { getDemoSessionUser } from "@/lib/demo";
import { getServerSession } from "next-auth";

export interface MailpilotUser {
  id: string;
  email: string | null;
  name: string | null;
}

export async function getCurrentUser(): Promise<MailpilotUser | null> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (userId) {
    return {
      id: userId,
      email: session.user?.email ?? null,
      name: session.user?.name ?? null,
    };
  }

  return getDemoSessionUser();
}
