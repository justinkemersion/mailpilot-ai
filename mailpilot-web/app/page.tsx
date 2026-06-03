import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function RootPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
