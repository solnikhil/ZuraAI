import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'selection:bg-primary selection:text-primary-foreground border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-input focus-visible:ring-0',
        'aria-invalid:border-destructive aria-invalid:ring-0',
        'font-[inherit] text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-muted)] file:text-[var(--theme-text-primary)]',
        className
      )}
      {...props}
    />
  )
}

export { Input }
