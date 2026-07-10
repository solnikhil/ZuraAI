import React, { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ModelCatalogRow } from './ModelCatalogRow'
import type { CatalogItem } from './catalogTypes'

const VENDOR_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  'meta-llama': 'Meta',
  meta: 'Meta',
  mistralai: 'Mistral',
  google: 'Google',
  'x-ai': 'xAI',
  deepseek: 'DeepSeek',
  qwen: 'Alibaba',
  microsoft: 'Microsoft',
  nvidia: 'NVIDIA',
  '01-ai': '01.AI',
  cohere: 'Cohere',
  agentica: 'Agentica',
  inferenceware: 'Inferenceware',
  liquid: 'Liquid AI',
  minimax: 'MiniMax',
  nemotron: 'NVIDIA',
}

function vendorLabel(vendor: string): string {
  if (VENDOR_LABELS[vendor]) return VENDOR_LABELS[vendor]
  return vendor.charAt(0).toUpperCase() + vendor.slice(1)
}

interface GroupedCatalogListProps<T> {
  items: CatalogItem<T>[]
  providerKey: string
  addedIds: Set<string>
  group: boolean
  onAdd: (item: CatalogItem<T>) => void
}

export function GroupedCatalogList<T>({
  items,
  providerKey,
  addedIds,
  group,
  onAdd,
}: GroupedCatalogListProps<T>): React.ReactElement {
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const rowRefs = useRef<Array<HTMLDivElement | null>>([])
  const viewportRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setFocusedIndex(-1)
  }, [items])

  useEffect(() => {
    if (focusedIndex < 0) return
    const node = rowRefs.current[focusedIndex]
    node?.scrollIntoView({ block: 'nearest' })
  }, [focusedIndex])

  const focusRow = (index: number) => {
    const clamped = Math.max(0, Math.min(index, items.length - 1))
    setFocusedIndex(clamped)
    rowRefs.current[clamped]?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusRow(focusedIndex < 0 ? 0 : Math.min(focusedIndex + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusRow(focusedIndex <= 0 ? 0 : focusedIndex - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusRow(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusRow(items.length - 1)
    }
  }

  if (group) {
    const groups = new Map<string, CatalogItem<T>[]>()
    for (const item of items) {
      const vendor = item.vendor ?? 'Other'
      const list = groups.get(vendor) ?? []
      list.push(item)
      groups.set(vendor, list)
    }
    const orderedVendors = Array.from(groups.keys()).sort((a, b) => {
      if (a === 'Other') return 1
      if (b === 'Other') return -1
      return vendorLabel(a).localeCompare(vendorLabel(b))
    })

    let runningIndex = -1
    return (
      <ScrollArea
        className="flex-1"
        viewportRef={viewportRef}
        viewportClassName="px-6 py-4"
        onKeyDown={handleKeyDown}
      >
        <div className="space-y-4">
          {orderedVendors.map((vendor) => {
            const groupItems = groups.get(vendor)!
            return (
              <section key={vendor}>
                <div className="sticky top-0 z-10 -mx-1 mb-1.5 bg-card/80 px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                  {vendorLabel(vendor)}
                  <span className="ml-2 font-normal text-muted-foreground/70">
                    {groupItems.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {groupItems.map((item) => {
                    runningIndex += 1
                    const idx = runningIndex
                    return (
                      <ModelCatalogRow
                        key={item.id}
                        item={item}
                        index={idx}
                        focused={focusedIndex === idx}
                        isAdded={addedIds.has(item.id)}
                        providerKey={providerKey}
                        onAdd={(rowItem) => onAdd(rowItem as CatalogItem<T>)}
                        onFocus={setFocusedIndex}
                        ref={(node: HTMLDivElement | null) => {
                          rowRefs.current[idx] = node
                        }}
                      />
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </ScrollArea>
    )
  }

  return (
    <ScrollArea
      className="flex-1"
      viewportRef={viewportRef}
      viewportClassName="px-6 py-4"
      onKeyDown={handleKeyDown}
    >
      <div className="space-y-1.5">
        {items.map((item, idx) => (
          <ModelCatalogRow
            key={item.id}
            item={item}
            index={idx}
            focused={focusedIndex === idx}
            isAdded={addedIds.has(item.id)}
            providerKey={providerKey}
            onAdd={(rowItem) => onAdd(rowItem as CatalogItem<T>)}
            onFocus={setFocusedIndex}
            ref={(node: HTMLDivElement | null) => {
              rowRefs.current[idx] = node
            }}
          />
        ))}
      </div>
    </ScrollArea>
  )
}
