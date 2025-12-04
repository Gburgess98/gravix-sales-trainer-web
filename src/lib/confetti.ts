// web/src/lib/confetti.ts
let mod: Promise<{ default: any }> | null = null;

export async function popConfetti(opts?: any) {
  if (typeof window === "undefined") return;
  if (!mod) mod = import("canvas-confetti");
  const { default: confetti } = await mod;
  confetti({
    particleCount: 100,
    spread: 60,
    startVelocity: 45,
    ticks: 200,
    origin: { y: 0.3 },
    ...opts,
  });
}