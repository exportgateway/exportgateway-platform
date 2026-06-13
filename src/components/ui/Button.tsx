"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline-dark";
  size?: "sm" | "md" | "lg";
  href?: string;
  children: React.ReactNode;
}

const variants = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  "outline-dark":
    "inline-flex items-center justify-center gap-2 rounded-lg border border-surface-dark-border bg-transparent px-5 py-2.5 text-sm font-semibold text-slate-300 transition-all duration-200 hover:bg-surface-dark-muted hover:text-white",
};

const sizes = {
  sm: "px-3.5 py-1.5 text-xs",
  md: "",
  lg: "px-6 py-3 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  href,
  className,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(variants[variant], size !== "md" && sizes[size], className);

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
