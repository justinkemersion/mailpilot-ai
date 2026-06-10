interface ConnectedEmailsPanelProps {
  emails: string[];
}

export function ConnectedEmailsPanel({ emails }: ConnectedEmailsPanelProps) {
  if (emails.length === 0) return null;

  return (
    <div
      className="mb-4 rounded-xl border border-border-subtle bg-surface-1 p-4"
      role="status"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
        Your connected Gmail addresses
      </p>
      <p className="mt-1 text-sm text-text-secondary">
        When connecting another inbox, pick an address that is not listed here.
      </p>
      <ul className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {emails.map((email) => (
          <li
            key={email}
            className="inline-flex min-h-9 max-w-full items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100"
            title={email}
          >
            <span className="whitespace-nowrap">{email}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
