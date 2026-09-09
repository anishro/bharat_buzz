export function Avatar({
  emoji,
  color,
  size = 40,
}: {
  emoji: string;
  color: string;
  size?: number;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl border border-border-soft"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: `linear-gradient(150deg, ${color}38, ${color}0f)`,
        boxShadow: `inset 0 0 0 1px ${color}33`,
      }}
      aria-hidden
    >
      {emoji}
    </div>
  );
}
