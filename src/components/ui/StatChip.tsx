const tones = {
  text: "text-text",
  muted: "text-muted",
  accent: "text-accent",
  healthy: "text-healthy",
  warning: "text-warning",
  danger: "text-danger",
  flow: "text-flow",
} as const;

export type StatTone = keyof typeof tones;

export function StatChip({
  label,
  value,
  tone = "text",
}: {
  label: string;
  value: string | number;
  tone?: StatTone;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className={`font-mono text-2xl tabular-nums ${tones[tone]}`}>
        {value}
      </span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}
