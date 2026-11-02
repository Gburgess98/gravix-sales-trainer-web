// Guards the glass design system v2 tokens: AA text contrast on every surface, white-on-primary, and the
// "glass is chrome, panels are opaque" contract. Reads the real CSS so a token edit cannot silently regress.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const css = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8')
const tok = (n: string) => {
  const m = css.match(new RegExp(`--ds-${n}:\\s*(#[0-9a-fA-F]{6})`))
  assert.ok(m, `--ds-${n} missing`)
  return m![1]
}
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const hex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
const lum = (h: string) => {
  const [r, g, b] = rgb(h).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
// glass = white @ alpha over a base (worst case: base lightened by the cyan ambient wash)
const over = (base: string, alpha: number) => hex(rgb(base).map((v) => v + (255 - v) * alpha))

const bg = tok('bg')
const SURFACES: Record<string, string> = {
  page: bg,
  panel: tok('panel'),
  raised: tok('panel-raised'),
  glass: over(bg, 0.04),
  'glass-on-wash': over('#0e1a26', 0.04),
  'glass-fallback': '#101827',
}

test('body, secondary and tertiary text meet AA (4.5:1) on every surface', () => {
  for (const t of ['text', 'text-2', 'text-3']) {
    for (const [name, s] of Object.entries(SURFACES)) {
      assert.ok(ratio(tok(t), s) >= 4.5, `--ds-${t} on ${name}: ${ratio(tok(t), s).toFixed(2)}`)
    }
  }
})

test('white text on the primary button (and hover) meets AA', () => {
  assert.ok(ratio('#ffffff', tok('primary')) >= 4.5)
  assert.ok(ratio('#ffffff', tok('primary-hover')) >= 4.5)
})

test('the cyan highlight (focus ring, active tab) is visible on every surface (3:1)', () => {
  for (const [name, s] of Object.entries(SURFACES)) assert.ok(ratio(tok('highlight'), s) >= 3, `highlight on ${name}`)
})

test('contrast helper is non-vacuous: a known failing pair is rejected', () => {
  assert.ok(ratio('#525252', '#0a0a0a') < 4.5)
})

test('glass is translucent + blurred with fallbacks; panel is opaque; reduced-motion/transparency honoured', () => {
  assert.match(css, /@utility ds-glass[\s\S]*?backdrop-filter/)
  assert.match(css, /prefers-reduced-transparency[\s\S]*?\.ds-glass/)
  assert.match(css, /@supports not \(\(backdrop-filter/)
  const panel = css.match(/@utility ds-panel \{[\s\S]*?\n\}/)![0]
  assert.match(panel, /background-color: var\(--ds-panel\)/)
  assert.doesNotMatch(panel, /backdrop-filter/)
})

test('status colours are not used as decoration in the ambient background', () => {
  const bgBlock = css.match(/@utility ds-app-bg \{[\s\S]*?\n\}/)![0]
  assert.doesNotMatch(bgBlock, /(239 68 68|245 158 11|16 185 129)/) // red / amber / green
})
