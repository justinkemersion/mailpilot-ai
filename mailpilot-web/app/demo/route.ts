import { redirect } from "next/navigation";

export async function GET() {
  redirect("/demo/enter");
}
