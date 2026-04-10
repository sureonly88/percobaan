import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

interface CardHeaderProps {
  title: string;
  badge?: React.ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, badge, className = "" }: CardHeaderProps) {
  return (
    <div
      className={`bg-slate-50 dark:bg-slate-700/50 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center ${className}`}
    >
      <h3 className="font-bold text-slate-900 dark:text-white">{title}</h3>
      {badge}
    </div>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}
