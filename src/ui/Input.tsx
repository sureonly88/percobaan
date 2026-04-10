"use client";

import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: string;
  prefix?: string;
  inputClassName?: string;
}

export function Input({
  label,
  icon,
  prefix,
  id,
  className = "",
  inputClassName = "",
  ...props
}: InputProps) {
  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label
          className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2"
          htmlFor={id}
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            {icon}
          </span>
        )}
        {prefix && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">
            {prefix}
          </span>
        )}
        <input
          id={id}
          className={`
            w-full bg-slate-50 dark:bg-slate-900
            border-slate-200 dark:border-slate-700
            rounded-xl focus:ring-2 focus:ring-primary focus:border-primary
            transition-all
            ${icon || prefix ? "pl-12" : "pl-4"} pr-4 py-3.5
            ${inputClassName}
          `}
          {...props}
        />
      </div>
    </div>
  );
}
