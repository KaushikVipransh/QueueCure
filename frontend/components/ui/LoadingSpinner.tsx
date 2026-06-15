'use client';

import clsx from 'clsx';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' };

  return (
    <div
      className={clsx(
        'animate-spin rounded-full border-2 border-transparent border-t-brand-400',
        sizes[size],
        className,
      )}
    />
  );
}

export function FullPageLoader({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-surface-800">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-2 border-brand-500/20" />
        <div className="absolute inset-0 w-16 h-16 animate-spin rounded-full border-2 border-transparent border-t-brand-400" />
      </div>
      <p className="text-slate-400 text-sm animate-pulse">{message}</p>
    </div>
  );
}
