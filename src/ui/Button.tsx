"use client";

import React from "react";

type ButtonVariant = "primary" | "outline" | "success" | "pill";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  children: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary hover:bg-primary/90 text-white font-bold shadow-md shadow-primary/20",
  outline:
    "border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold",
  success:
    "bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-500/20",
  pill:
    "bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-600",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1 rounded-lg text-xs",
  md: "px-4 py-4 rounded-xl",
  lg: "px-8 py-3.5 rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        transition-all flex items-center justify-center gap-2
        ${className}
      `}
      {...props}
    >
      {icon && (
        <span
          className={`material-symbols-outlined ${size === "sm" ? "text-sm" : ""}`}
        >
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}
