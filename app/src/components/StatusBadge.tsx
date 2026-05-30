type Props = { label: string; color: string };

export function StatusBadge({ label, color }: Props) {
  return (
    <span
      className="badge"
      style={{
        background: `${color}15`,
        color,
      }}
    >
      <span className="badge-dot" style={{ background: color }} />
      {label}
    </span>
  );
}
