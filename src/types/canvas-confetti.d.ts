// Ambient declaration for `canvas-confetti`, which ships no bundled types.
// Minimal signature covering the options used in src/lib/confetti.ts.
declare module "canvas-confetti" {
  export interface ConfettiOptions {
    particleCount?: number;
    spread?: number;
    startVelocity?: number;
    ticks?: number;
    origin?: { x?: number; y?: number };
    [key: string]: unknown;
  }
  export default function confetti(
    options?: ConfettiOptions
  ): Promise<void> | void;
}
