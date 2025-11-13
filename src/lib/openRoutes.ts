// src/lib/openRoutes.ts
export function getOpenPrefixes(): string[] {
  const fromEnv = (process.env.NEXT_PUBLIC_OPEN_ROUTES || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  // Built-ins we want public by default:
  const builtIn = ['/crm', '/recent-calls']

  // Merge + de-dupe
  return Array.from(new Set([...builtIn, ...fromEnv]))
}

export function isOpenPath(pathname: string): boolean {
  const prefixes = getOpenPrefixes()
  return prefixes.some(p => pathname === p || pathname.startsWith(p + '/'))
}

// Emergency kill switch for all guards:
export function guardDisabled(): boolean {
  return process.env.NEXT_PUBLIC_DISABLE_GUARD === '1'
}