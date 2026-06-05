import { EmptyState } from "@/components/ui/EmptyState";
import { Mail } from "lucide-react";

export function AccountsEmptyState() {
  return (
    <EmptyState
      icon={Mail}
      title="No Gmail accounts connected"
      description="Connect a Gmail account to start automatic sorting and labeling."
      action={{ label: "Connect Gmail", href: "/auth/google" }}
    />
  );
}
