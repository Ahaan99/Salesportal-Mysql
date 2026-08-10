import { cn } from "@/lib/utils";

type AvatarProps = {
  seed?: string;
  className?: string;
  online?: boolean;
};

export function Avatar({
  seed = "User",
  className,
  online,
}: AvatarProps) {
  const initials = seed
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary ring-1 ring-primary/15">
        {initials}
      </span>

      {online !== undefined && (
        <span
          aria-hidden
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-card",
            online ? "bg-primary" : "bg-muted-foreground/40"
          )}
        />
      )}
    </div>
  );
}