import { clsx } from 'clsx'

interface PageContainerProps {
  children: React.ReactNode
  className?: string
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={clsx('p-6 space-y-6', className)}>
      {children}
    </div>
  )
}
