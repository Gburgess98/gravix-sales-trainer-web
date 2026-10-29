import { clsx } from 'clsx'

interface PageContainerProps {
  children: React.ReactNode
  className?: string
}

// Day 45 — restrained shared frame: readable max width, responsive gutters and
// more vertical rhythm on large screens. All shell pages inherit it.
export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={clsx('mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 lg:space-y-8 lg:px-10 lg:py-8', className)}>
      {children}
    </div>
  )
}
