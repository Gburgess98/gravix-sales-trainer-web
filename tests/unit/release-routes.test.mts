import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RELEASE_HIDDEN_ROUTES, isReleaseHidden } from '../../src/config/release-hidden.ts'
import { navigation } from '../../src/config/navigation.ts'

/* 2026-11 production release decisions, locked as tests:
   1. /admin/reps and /crm/manager/nudges are unreachable: nothing links to them and their layouts render the calm unavailable result
      (children are never rendered, so the page code never mounts or fetches).
   2. /crm/contacts/[id] has no server-side localhost fallback and keeps authenticated access (client page, Bearer via proxyFetch).
   3. PROXY_ALLOW_DEFAULT_ORG stays absent from every committed env/config file. */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = join(ROOT, 'src')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|mts)$/.test(e)) out.push(p)
  }
  return out
}

test('the hidden list is exactly the two withheld routes and the matcher handles sub-paths, queries and look-alikes', () => {
  assert.deepEqual([...RELEASE_HIDDEN_ROUTES], ['/admin/reps', '/crm/manager/nudges'])
  for (const p of ['/admin/reps', '/admin/reps/', '/admin/reps?x=1', '/admin/reps/123', '/crm/manager/nudges', '/crm/manager/nudges/']) assert.equal(isReleaseHidden(p), true, p)
  for (const p of ['/admin/repsx', '/admin', '/crm/manager', '/crm/manager/contacts', '/crm/reps/1', '/team']) assert.equal(isReleaseHidden(p), false, p)
})

test('direct access: each hidden route has a layout that renders the unavailable result and never its children', () => {
  for (const r of RELEASE_HIDDEN_ROUTES) {
    const f = join('src/app', ...r.split('/').filter(Boolean), 'layout.tsx')
    assert.ok(existsSync(join(ROOT, f)), `${f} exists`)
    const src = strip(read(f))
    assert.match(src, /<UnavailableRoute\s*\/>/, `${f} renders UnavailableRoute`)
    assert.doesNotMatch(src, /children/, `${f} must not render children (the page must never mount)`)
  }
  const ui = read('src/components/UnavailableRoute.tsx')
  assert.match(ui, /isn’t available yet/)
  assert.doesNotMatch(strip(ui), /fetch\(|proxyFetch|useEffect/, 'the unavailable result makes no requests')
})

test('the withheld Nudges route cannot execute its old fetch: inert prerendered page, original out of the route tree and imported by nothing', () => {
  const page = strip(read('src/app/crm/manager/nudges/page.tsx'))
  assert.match(page, /export const dynamic = 'force-static'/)
  assert.match(page, /<UnavailableRoute\s*\/>/)
  assert.doesNotMatch(page, /fetch\(|headers\(|INTERNAL_API_BASE_URL|localhost|"use server"|async function|await /, 'no server or browser work in the route page')
  const old = read('src/withheld/crm-manager-nudges-page.tsx')
  assert.match(old, /INTERNAL_API_BASE_URL/, 'the original is preserved for re-enabling')
  const importers: string[] = []
  for (const f of walk(SRC)) {
    if (relative(ROOT, f).startsWith('src/withheld')) continue
    if (/withheld\/crm-manager-nudges-page|ManagerNudgesPage/.test(readFileSync(f, 'utf8'))) importers.push(relative(ROOT, f))
  }
  assert.deepEqual(importers, [], 'nothing may import the withheld page')
  assert.ok(!existsSync(join(SRC, 'app', 'crm', 'manager', 'nudges', 'ManagerNudgesPage.tsx')))
})

test('navigation: no entry, link or href points at a hidden route', () => {
  const flat = JSON.stringify(navigation)
  for (const r of RELEASE_HIDDEN_ROUTES) assert.ok(!flat.includes(r), `navigation config mentions ${r}`)
  const offenders: string[] = []
  for (const f of walk(SRC)) {
    const rel = relative(ROOT, f)
    if (RELEASE_HIDDEN_ROUTES.some((r) => rel.startsWith(join('src/app', ...r.split('/').filter(Boolean))))) continue
    if (rel === 'src/config/release-hidden.ts') continue
    const code = strip(readFileSync(f, 'utf8'))
    for (const r of RELEASE_HIDDEN_ROUTES) {
      if (new RegExp(`(href|to|push|replace|redirect)\\s*[=(:]\\s*[{]?\\s*[\`'"]${r}[\`'"?/]`).test(code) || new RegExp(`href=["'{\`]+${r}`).test(code)) offenders.push(`${rel} -> ${r}`)
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'))
})

test('non-vacuous: the link scan would catch a planted link', () => {
  const planted = `<Link href="/admin/reps">Reps</Link>`
  assert.ok(new RegExp(`href=["'{\`]+/admin/reps`).test(planted))
})

test('/crm/contacts/[id]: no server-side localhost fallback, authenticated client fetches', () => {
  const src = read('src/app/crm/contacts/[id]/page.tsx')
  const code = strip(src)
  assert.match(src, /^"use client";/m)
  assert.doesNotMatch(code, /localhost|INTERNAL_API_BASE_URL|next\/headers|"use server"|x-user-id/)
  assert.match(code, /proxyFetch\(path\)/)
  assert.match(code, /\/api\/proxy\/v1\/crm\/contacts\/\$\{enc\}\/activity/)
  assert.match(code, /\/api\/proxy\/v1\/crm\/contacts\/\$\{enc\}`/)
})

test('/crm/contacts/[id] panels use proxyFetch (Bearer), never a bare fetch to the proxy', () => {
  for (const f of ['ContactHeaderClient', 'AIBriefClient', 'ContactAssignmentsClient', 'RepNotesClient']) {
    const code = strip(read(`src/app/crm/contacts/[id]/${f}.tsx`))
    assert.doesNotMatch(code, /(^|[^A-Za-z])fetch\(/, `${f} must not call bare fetch(`)
    assert.match(code, /proxyFetch\(/, `${f} uses proxyFetch`)
  }
})

test('PROXY_ALLOW_DEFAULT_ORG is not set in any committed env or deployment config', () => {
  for (const f of ['.env', '.env.local', '.env.production', '.env.example', '.env.staging', 'vercel.json', 'next.config.ts', 'next.config.js', 'next.config.mjs']) {
    if (existsSync(join(ROOT, f))) assert.doesNotMatch(read(f), /PROXY_ALLOW_DEFAULT_ORG\s*[=:]/, f)
  }
})
