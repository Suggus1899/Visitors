import React from 'react';

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circular' | 'rectangular';
    width?: string | number;
    height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
    className = '',
    variant = 'rectangular',
    width,
    height
}) => {
    const baseClasses = 'animate-pulse bg-[color:var(--surface-2)]';

    const variantClasses = {
        text: 'rounded',
        circular: 'rounded-full',
        rectangular: 'rounded-lg'
    };

    const style: React.CSSProperties = {
        width: width || '100%',
        height: height || (variant === 'text' ? '1rem' : '100%')
    };

    return (
        <div
            className={`${baseClasses} ${variantClasses[variant]} ${className}`}
            style={style}
        />
    );
};

// Preset skeleton components
export const SkeletonCard: React.FC = () => (
    <div className="panel-tech rounded-lg p-4 space-y-3">
        <div className="flex items-center space-x-3">
            <Skeleton variant="circular" width={48} height={48} />
            <div className="flex-1 space-y-2">
                <Skeleton variant="text" width="60%" height={16} />
                <Skeleton variant="text" width="40%" height={12} />
            </div>
        </div>
        <Skeleton variant="rectangular" height={60} />
    </div>
);

export const SkeletonTable: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
    <div className="space-y-2">
        {/* Header */}
        <div className="flex gap-4 p-3 bg-[color:var(--surface-2)] rounded border border-[color:var(--border-1)]">
            {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} variant="text" width={`${20 + i * 5}%`} height={14} />
            ))}
        </div>
        {/* Rows */}
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex gap-4 p-3 border-b border-[color:var(--border-1)]">
                {[1, 2, 3, 4].map(j => (
                    <Skeleton key={j} variant="text" width={`${15 + j * 5}%`} height={12} />
                ))}
            </div>
        ))}
    </div>
);

export const SkeletonVisitCard: React.FC = () => (
    <div className="panel-tech rounded-lg p-4 flex items-center gap-4">
        <Skeleton variant="circular" width={56} height={56} />
        <div className="flex-1 space-y-2">
            <Skeleton variant="text" width="70%" height={18} />
            <Skeleton variant="text" width="50%" height={14} />
            <Skeleton variant="text" width="30%" height={12} />
        </div>
        <Skeleton variant="rectangular" width={80} height={32} className="rounded-full" />
    </div>
);
