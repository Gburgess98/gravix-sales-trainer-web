// Guards the WCAG AA text-contrast fix in globals.css: Tailwind's neutral-500/600 fail AA on the
// dark surfaces, so the project overrides them. If someone deletes or darkens the override, this fails.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const css = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8')

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const token = (name: string) => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))
  assert.ok(m, `--color-${name} override missing from globals.css`)
  return m![1]
}

// Backgrounds the app actually puts copy on: page, card (neutral-950), raised card (neutral-900).
const SURFACES = { page: '#060609', card: '#0a0a0a', raised: '#171717' }

test('neutral-500 text meets AA (4.5:1) on page, card and raised surfaces', () => {
  const fg = token('neutral-500')
  for (const [name, bg] of Object.entries(SURFACES)) assert.ok(ratio(fg, bg) >= 4.5, `neutral-500 on ${name}: ${ratio(fg, bg).toFixed(2)}`)
})

test('neutral-600 text meets AA (4.5:1) on page, card and raised surfaces', () => {
  const fg = token('neutral-600')
  for (const [name, bg] of Object.entries(SURFACES)) assert.ok(ratio(fg, bg) >= 4.5, `neutral-600 on ${name}: ${ratio(fg, bg).toFixed(2)}`)
})

test('the contrast helper reproduces the audited Tailwind defaults (non-vacuous)', () => {
  assert.ok(Math.abs(ratio('#737373', '#0a0a0a') - 4.17) < 0.02) // default neutral-500 fails
  assert.ok(Math.abs(ratio('#525252', '#0a0a0a') - 2.53) < 0.02) // default neutral-600 fails
})

test('shell has a skip link to the main landmark', () => {
  const shell = readFileSync(path.join(ROOT, 'src/components/shell/app-shell.tsx'), 'utf8')
  assert.match(shell, /href="#main-content"/)
  assert.match(shell, /<main id="main-content"/)
})
