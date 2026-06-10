import type { RealOrModeled } from "@/lib/types";

const styles: Record<RealOrModeled, { className: string; title: string }> = {
  REAL: {
    className: "border-healthy/40 text-healthy",
    title: "This logic genuinely runs on the server.",
  },
  MODELED: {
    className: "border-flow/40 text-flow",
    title: "Separate nodes are modeled in-process (see README §0).",
  },
};

export function RealModeledBadge({ kind }: { kind: RealOrModeled }) {
  const style = styles[kind];
  return (
    <span
      title={style.title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xs ${style.className}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {kind}
    </span>
  );
}
