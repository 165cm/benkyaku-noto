import type { HTMLAttributes } from 'react'
import clsx from 'clsx'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean
}

export default function Card({ hover = false, className, children, ...props }: CardProps) {
  return (
    <div
      className={clsx('notion-card', hover && 'notion-hover', className)}
      {...props}
    >
      {children}
    </div>
  )
}
