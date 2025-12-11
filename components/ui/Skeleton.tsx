import React from 'react';

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circular' | 'rectangular';
    width?: string | number;
    height?: string | number;
    animation?: 'pulse' | 'wave' | 'none';
}

/**
 * مكون Skeleton للـ Loading States
 * يعرض عنصر نائب متحرك أثناء تحميل المحتوى
 */
export function Skeleton({
    className = '',
    variant = 'text',
    width,
    height,
    animation = 'pulse'
}: SkeletonProps) {
    const baseClasses = 'bg-gray-200';

    const variantClasses = {
        text: 'rounded',
        circular: 'rounded-full',
        rectangular: 'rounded-lg'
    };

    const animationClasses = {
        pulse: 'animate-pulse',
        wave: 'skeleton-wave',
        none: ''
    };

    const style: React.CSSProperties = {};
    if (width) style.width = typeof width === 'number' ? `${width}px` : width;
    if (height) style.height = typeof height === 'number' ? `${height}px` : height;

    return (
        <div
            className={`${baseClasses} ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
            style={style}
        />
    );
}

/**
 * Skeleton لصف في جدول
 */
export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
    return (
        <tr className="border-b border-gray-100">
            {Array.from({ length: columns }).map((_, i) => (
                <td key={i} className="px-4 py-3">
                    <Skeleton height={16} className="w-full" />
                </td>
            ))}
        </tr>
    );
}

/**
 * Skeleton لجدول كامل
 */
export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
    return (
        <div className="animate-pulse">
            {/* Header */}
            <div className="flex gap-4 p-4 bg-gray-50 border-b">
                {Array.from({ length: columns }).map((_, i) => (
                    <Skeleton key={i} height={20} className="flex-1" />
                ))}
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-100">
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="flex gap-4 p-4">
                        {Array.from({ length: columns }).map((_, j) => (
                            <Skeleton key={j} height={16} className="flex-1" />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Skeleton لبطاقة إحصائيات
 */
export function StatCardSkeleton() {
    return (
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-200 animate-pulse">
            <div className="flex items-center justify-between">
                <div className="flex-1">
                    <Skeleton height={14} width="60%" className="mb-2" />
                    <Skeleton height={28} width="40%" />
                </div>
                <Skeleton variant="circular" width={40} height={40} />
            </div>
        </div>
    );
}

/**
 * Skeleton لعنصر قائمة
 */
export function ListItemSkeleton() {
    return (
        <div className="flex items-center gap-3 p-3 animate-pulse">
            <Skeleton variant="circular" width={40} height={40} />
            <div className="flex-1">
                <Skeleton height={16} width="70%" className="mb-2" />
                <Skeleton height={12} width="50%" />
            </div>
        </div>
    );
}

/**
 * Skeleton لبطاقة منتج/طلب
 */
export function CardSkeleton() {
    return (
        <div className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
            <div className="flex justify-between items-start mb-3">
                <Skeleton height={18} width="60%" />
                <Skeleton height={24} width={60} variant="rectangular" />
            </div>
            <div className="space-y-2">
                <Skeleton height={14} width="80%" />
                <Skeleton height={14} width="65%" />
                <Skeleton height={14} width="45%" />
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100">
                <Skeleton height={36} width="100%" variant="rectangular" />
            </div>
        </div>
    );
}

/**
 * Skeleton للوحة التحكم
 */
export function DashboardSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <StatCardSkeleton key={i} />
                ))}
            </div>

            {/* Charts/Tables Area */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <Skeleton height={20} width="40%" className="mb-4" />
                    <Skeleton height={200} width="100%" variant="rectangular" />
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <Skeleton height={20} width="40%" className="mb-4" />
                    <div className="space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <ListItemSkeleton key={i} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Skeleton;
