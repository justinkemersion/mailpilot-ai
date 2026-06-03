export interface ClassifierInfo {
  ai_provider?: string;
  ai_model?: string;
  ai_label?: string;
}

/** Human-readable classifier label from run_jobs.result (or legacy rows without it). */
export function classifierLabel(info: ClassifierInfo | null | undefined): string | null {
  if (!info) return null;
  if (info.ai_label?.trim()) return info.ai_label.trim();

  const provider = info.ai_provider?.trim().toLowerCase();
  const model = info.ai_model?.trim();
  if (provider === "cloudflare") {
    const short = (model ?? "unknown model")
      .replace(/^@cf\/meta\//, "")
      .replace(/-/g, " ");
    return `Cloudflare Workers AI · ${short}`;
  }
  if (provider === "openai") {
    return `OpenAI · ${model ?? "unknown model"}`;
  }
  if (model) return model;
  return null;
}

export function classifierProviderName(
  info: ClassifierInfo | null | undefined
): string | null {
  const provider = info?.ai_provider?.trim().toLowerCase();
  if (provider === "cloudflare") return "Cloudflare Workers AI";
  if (provider === "openai") return "OpenAI";
  return null;
}
