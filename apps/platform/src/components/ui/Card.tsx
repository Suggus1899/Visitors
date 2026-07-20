import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`panel-tech rounded-xl p-5 ${className}`}>
      {children}
    </div>
  );
}
