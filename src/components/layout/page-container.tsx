import { clsx } from 'clsx'

interface PageContainerProps {
  children: React.ReactNode
  className?: string
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={clsx('mx-auto w-full max-w-[1400px] p-6 lg:px-8 space-y-6', className)}>
      {children}
    </div>
  )
}
