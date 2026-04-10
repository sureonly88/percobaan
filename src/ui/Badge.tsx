import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "yellow" | "primary" | "success" | "danger" | "warning";
  className?: string;
}

const variantClasses: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-slate-100 text-slate-600",
  yellow: "bg-pln-yellow/20 text-pln-blue",
  primary: "bg-primary/10 text-primary",
  success: "bg-emerald-100 text-emerald-700",
  danger: "bg-red-100 text-red-700",
  warning: "bg-amber-100 text-amber-700",
};

export function Badge({
  children,
  variant = "default",
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`px-2 py-1 text-[10px] font-black rounded uppercase ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
