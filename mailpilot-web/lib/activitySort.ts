export type ActivitySort = "received_desc" | "account_asc" | "account_desc";

export const ACTIVITY_SORT_OPTIONS: Array<{ value: ActivitySort; label: string }> = [
  { value: "received_desc", label: "Received (newest)" },
  { value: "account_asc", label: "Mailbox A–Z" },
  { value: "account_desc", label: "Mailbox Z–A" },
];

export function parseActivitySort(value: string | null | undefined): ActivitySort {
  if (value === "account_asc" || value === "account_desc") return value;
  return "received_desc";
}

export function activityOrderParams(sort: ActivitySort): Array<[string, string]> {
  if (sort === "account_asc") {
    return [
      ["order", "accounts(email).asc"],
      ["order", "message_received_at.desc.nullslast"],
      ["order", "id.asc"],
    ];
  }
  if (sort === "account_desc") {
    return [
      ["order", "accounts(email).desc"],
      ["order", "message_received_at.desc.nullslast"],
      ["order", "id.asc"],
    ];
  }
  return [
    ["order", "message_received_at.desc.nullslast"],
    ["order", "processed_at.desc"],
    ["order", "id.asc"],
  ];
}
