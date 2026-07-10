import { clsx } from 'clsx'
import { ButtonHTMLAttributes, forwardRef } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

// Day 198 — canonical Command Centre button recipes (Days 195–197 hand-copied
// these per call site). brand = action/AI, neutral = secondary, danger = red.
// Day 203 — recipes now use the semantic colour roles (brand/danger) instead of
// raw indigo/red; the tokens alias the same palette so rendered output is
// unchanged, and a white-label can retint via the token layer alone.
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 font-semibold text-white hover:bg-brand-500',
  secondary: 'bg-brand-600/20 font-semibold text-brand-200 hover:bg-brand-600/30',
  ghost: 'border border-neutral-700 text-neutral-300 hover:bg-neutral-800',
  danger: 'border border-danger-500/30 text-danger-300 hover:bg-danger-500/10',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3.5 py-1.5 text-sm',
}

/**
 * Class-only helper so `<Link>` and `<a>` elements can share the button
 * recipes without changing element semantics.
 */
export function buttonClasses(
  variant: ButtonVariant = 'ghost',
  size: ButtonSize = 'sm',
  className?: string
) {
  return clsx(
    'inline-flex items-center justify-center rounded-md transition-colors disabled:opacity-50',
    VARIANT[variant],
    SIZE[size],
    className
  )
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'ghost', size = 'sm', className, type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, size, className)}
      {...props}
    />
  )
})
