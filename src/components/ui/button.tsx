import { clsx } from 'clsx'
import { ButtonHTMLAttributes, forwardRef } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

// Day 198 — canonical Command Centre button recipes (Days 195–197 hand-copied
// these per call site). Indigo = action/AI, neutral = secondary, red = danger.
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-indigo-600 font-semibold text-white hover:bg-indigo-500',
  secondary: 'bg-indigo-600/20 font-semibold text-indigo-200 hover:bg-indigo-600/30',
  ghost: 'border border-neutral-700 text-neutral-300 hover:bg-neutral-800',
  danger: 'border border-red-500/30 text-red-300 hover:bg-red-500/10',
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
