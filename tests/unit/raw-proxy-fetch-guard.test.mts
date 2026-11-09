import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

/* The raw-proxy-fetch guard (scripts/check-no-raw-proxy-fetch.sh) must (1) pass on the real tree, (2) catch every shape of bare
   fetch() to /api/proxy — proven by PLANTING violations in a temp tree — and (3) leave legitimate helper use alone.
   The converted call sites must use proxyFetch and must not set identity headers by hand. */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const GUARD = join(ROOT, 'scripts', 'check-no-raw-proxy-fetch.sh')
const run = (dir: string, allow?: string) =>
  spawnSync('bash', [GUARD, dir], { encoding: 'utf8', env: { ...process.env, ...(allow ? { RAW_PROXY_FETCH_ALLOWLIST: allow } : { RAW_PROXY_FETCH_ALLOWLIST: '/dev/null' }) } })

function tree(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'rawproxy-'))
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true })
    writeFileSync(join(dir, name), body)
  }
  return dir
}

test('the real tree passes the guard', () => {
  const r = spawnSync('bash', [GUARD], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
})

const PLANTED: Record<string, string> = {
  'double.tsx': `export const a = () => fetch("/api/proxy/v1/x")`,
  'single.tsx': `export const a = () => fetch('/api/proxy/v1/x', { method: 'POST' })`,
  'template.tsx': 'export const a = (id) => fetch(`/api/proxy/v1/x/${id}`, { cache: "no-store" })',
  'multiline.tsx': 'export const a = async (id) => {\n  const r = await fetch(\n    `/api/proxy/v1/crm/actions/${id}/complete`,\n    { method: "POST" }\n  )\n}',
  'base-prefixed.tsx': 'export const a = (base) => fetch(`${base}/api/proxy/v1/x`)',
  'const-base.tsx': 'const PROXY = "/api/proxy"\nexport const a = () => fetch(`${PROXY}/v1/x`)',
  'const-concat.tsx': 'const PROXY = "/api/proxy"\nexport const a = () => fetch(PROXY + "/v1/x")',
  'indirect.tsx': 'const path = "/api/proxy/v1/whisperer/preview"\nexport const a = (url = path) => fetch(url, { method: "POST" })',
}

for (const [name, body] of Object.entries(PLANTED)) {
  test(`non-vacuous: a planted violation (${name}) fails the guard and is named`, () => {
    const dir = tree({ [name]: body })
    try {
      const r = run(dir)
      assert.equal(r.status, 1, `${name} should fail`)
      assert.ok(r.stdout.includes(name), `${name} should be reported:\n${r.stdout}`)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
}

test('helpers, look-alikes and non-proxy fetches pass', () => {
  const dir = tree({
    'ok-helpers.tsx': 'import { proxyFetch } from "@/lib/api"\nexport const a = (id) => proxyFetch(`/api/proxy/v1/x/${id}`, { method: "POST" })\nexport const b = () => fetchJsonWithRetry("/api/proxy/v1/y")',
    'ok-lookalike.tsx': 'export const a = () => myfetch("/api/proxy/v1/x")\nexport const b = () => obj.fetch("/api/proxy/v1/x")',
    'ok-external.tsx': 'export const a = () => fetch("https://api.example.com/x")\nexport const b = (hook) => fetch(hook, {})',
    'ok-link.tsx': 'export const a = () => <a href="/api/proxy/v1/admin/status">status</a>',
  })
  try {
    const r = run(dir)
    assert.equal(r.status, 0, r.stdout)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('the allowlist is honoured, and only for the named file', () => {
  const dir = tree({ 'allowed.tsx': 'export const a = () => fetch("/api/proxy/v1/x")', 'other.tsx': 'export const b = () => fetch("/api/proxy/v1/y")' })
  const allow = join(dir, 'allow.txt')
  writeFileSync(allow, `# reason\n${join(dir, 'allowed.tsx')}\n`)
  try {
    const r = run(dir, allow)
    assert.equal(r.status, 1)
    assert.ok(r.stdout.includes('other.tsx') && !r.stdout.includes('allowed.tsx:'), r.stdout)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

const CONVERTED: [string, number][] = [
  ['src/components/CRMPanel.tsx', 10],
  ['src/components/RunHistoryTable.tsx', 4],
  ['src/components/AssignmentsList.tsx', 1],
  ['src/app/crm/reps/[id]/page.tsx', 3],
  ['src/app/admin/score/page.tsx', 2],
  ['src/app/health/page.tsx', 1],
  ['src/components/Whisperer/WhispererPanel.tsx', 1],
  ['src/lib/Admin/adminConfig.ts', 2],
]
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

for (const [file, count] of CONVERTED) {
  test(`${file}: ${count} proxy call(s) use proxyFetch, none are bare, no identity headers are set by hand`, () => {
    const code = strip(readFileSync(join(ROOT, file), 'utf8'))
    assert.doesNotMatch(code, /(?<![A-Za-z0-9_$.])fetch\(/, 'no bare fetch(')
    assert.equal((code.match(/proxyFetch\(/g) || []).length, count, 'proxyFetch call count')
    assert.match(code, /import\s*\{\s*proxyFetch\s*\}\s*from\s*["']@\/lib\/api["']/)
    // identity must come from the verified session via the helper, never from a header written in the page/component
    assert.doesNotMatch(code, /["'`](x-user-id|x-org-id|x-gravix-user-id|x-forwarded-user-id|x-proxy-secret|x-impersonated-user-id)["'`]\s*:/i)
  })
}

test('the Whisperer preview no longer bypasses the proxy with a direct localhost call', () => {
  const code = strip(readFileSync(join(ROOT, 'src/components/Whisperer/WhispererPanel.tsx'), 'utf8'))
  assert.doesNotMatch(code, /localhost/)
  assert.match(code, /\/api\/proxy\/v1\/whisperer\/preview/)
})
