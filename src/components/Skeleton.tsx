import clsx from 'clsx'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular' | 'card'
  width?: string | number
  height?: string | number
  lines?: number
}

export default function Skeleton({
  className,
  variant = 'text',
  width,
  height,
  lines = 1,
}: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-gray-200 rounded'

  const getVariantClasses = () => {
    switch (variant) {
      case 'circular':
        return 'rounded-full'
      case 'rectangular':
        return 'rounded-md'
      case 'card':
        return 'rounded-lg'
      default:
        return 'rounded'
    }
  }

  const style = {
    width: width || (variant === 'text' ? '100%' : undefined),
    height: height || (variant === 'text' ? '1rem' : undefined),
  }

  if (variant === 'text' && lines > 1) {
    return (
      <div className={clsx('space-y-2', className)}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={clsx(baseClasses, getVariantClasses())}
            style={{
              ...style,
              width: i === lines - 1 ? '75%' : '100%',
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={clsx(baseClasses, getVariantClasses(), className)}
      style={style}
    />
  )
}

// Skeleton組み合わせパターン
export function SkeletonCard() {
  return (
    <div className="notion-card space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="flex-1">
          <Skeleton variant="text" width="60%" height="1.25rem" />
          <Skeleton variant="text" width="40%" height="0.875rem" className="mt-1" />
        </div>
      </div>
      <Skeleton variant="text" lines={3} />
    </div>
  )
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

export function SkeletonWorkbookCard() {
  return (
    <div className="notion-card">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <Skeleton variant="text" width="70%" height="1.5rem" />
          <Skeleton variant="text" width="40%" height="1rem" className="mt-2" />
        </div>
        <Skeleton variant="rectangular" width={24} height={24} />
      </div>
      <div className="flex gap-4 text-sm">
        <Skeleton variant="text" width={80} height="1rem" />
        <Skeleton variant="text" width={100} height="1rem" />
      </div>
    </div>
  )
}
