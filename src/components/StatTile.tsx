interface Props {
  label: string;
  value: string;
  sublabel?: string;
}

export function StatTile({ label, value, sublabel }: Props) {
  return (
    <div className="rounded-lg border border-[var(--gridline)] bg-[var(--surface-1)] p-4">
      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold text-[var(--text-primary)] mt-1">{value}</div>
      {sublabel && <div className="text-xs text-[var(--text-secondary)] mt-1">{sublabel}</div>}
    </div>
  );
}
