import { notFound } from 'next/navigation'

// Developer-only pages (fixture previews). In production they do not exist (404) unless ENABLE_DEV_ROUTES=1 is set
// on the server; in development and in `next dev`-based tests they are available.
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEV_ROUTES !== '1') notFound()
  return <>{children}</>
}
