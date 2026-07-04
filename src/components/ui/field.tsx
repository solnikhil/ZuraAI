import * as React from 'react'

import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'

type FieldOrientation = 'vertical' | 'horizontal' | 'responsive'

interface FieldProps extends React.ComponentProps<'div'> {
  orientation?: FieldOrientation
}

function Field({ className, orientation = 'vertical', ...props }: FieldProps) {
  return (
    <div
      data-slot="field"
      role="group"
      className={cn(
        'group grid gap-2',
        orientation === 'horizontal' && 'sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-start',
        orientation === 'responsive' &&
          '@container/field-group:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] @container/field-group:items-start',
        className
      )}
      {...props}
    />
  )
}

function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-group"
      className={cn('@container/field-group flex flex-col gap-6', className)}
      {...props}
    />
  )
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn('text-sm font-medium leading-none', className)}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="field-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export { Field, FieldGroup, FieldLabel, FieldDescription }
