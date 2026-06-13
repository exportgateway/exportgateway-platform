import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  variant?: "light" | "dark";
  showText?: boolean;
}

export function Logo({ className, variant = "light", showText = true }: LogoProps) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5 group", className)}>
      <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-md shadow-brand-500/20 transition-transform duration-200 group-hover:scale-105">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-5 w-5 text-white"
          aria-hidden="true"
        >
          <path
            d="M12 2L2 7l10 5 10-5-10-5z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M2 17l10 5 10-5M2 12l10 5 10-5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {showText && (
        <span
          className={cn(
            "text-lg font-bold tracking-tight",
            variant === "dark" ? "text-white" : "text-slate-900"
          )}
        >
          Export<span className="text-brand-600">Gateway</span>
        </span>
      )}
    </Link>
  );
}
