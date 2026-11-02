// Inline SVG "hologram" bust for a persona. No image request, so nothing to lazy-load for the prototype;
// when real artwork exists (`art_url`), render it as <img loading="lazy" decoding="async"> in place of this.
// Decorative only: aria-hidden. Hue comes from a stable hash of the persona id (cyan <-> violet range).

const hueFor = (id: string) => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return 185 + (h % 90) // 185 (cyan) .. 275 (violet)
}

export function PersonaGlyph({ id, size = 112 }: { id: string; size?: number }) {
  const hue = hueFor(id)
  const a = `hsl(${hue} 90% 62%)`
  const b = `hsl(${(hue + 40) % 360} 85% 60%)`
  const gid = `g-${id}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
      className="mx-auto block"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
        <radialGradient id={`${gid}-bg`} cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor={a} stopOpacity="0.28" />
          <stop offset="1" stopColor={a} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${gid}-clip`}>
          <circle cx="60" cy="60" r="46" />
        </clipPath>
      </defs>
      <circle cx="60" cy="60" r="56" fill={`url(#${gid}-bg)`} />
      <circle cx="60" cy="60" r="54" fill="none" stroke={a} strokeOpacity="0.35" strokeWidth="1" strokeDasharray="2 5" />
      <circle cx="60" cy="60" r="46" fill="rgba(4,8,22,0.7)" stroke={`url(#${gid})`} strokeWidth="1.5" />
      <g clipPath={`url(#${gid}-clip)`}>
        <circle cx="60" cy="48" r="15" fill="none" stroke={`url(#${gid})`} strokeWidth="2" />
        <path d="M24 108c2-22 16-34 36-34s34 12 36 34" fill="none" stroke={`url(#${gid})`} strokeWidth="2" />
        {/* scanlines */}
        {Array.from({ length: 9 }, (_, i) => (
          <line key={i} x1="10" x2="110" y1={20 + i * 10} y2={20 + i * 10} stroke={a} strokeOpacity="0.1" />
        ))}
      </g>
    </svg>
  )
}
