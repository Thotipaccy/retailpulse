import type { ImgHTMLAttributes, ReactNode } from 'react'

export function Avatar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`relative overflow-hidden rounded-full ${className}`}>{children}</div>
}

export function AvatarImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  return <img {...props} />
}

export function AvatarFallback({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex h-full w-full items-center justify-center rounded-full ${className}`}>{children}</div>
}
