import * as React from "react"
import { ChevronRight, File as FileIcon, Folder, FolderOpen } from "lucide-react"

import { cn } from "@/lib/utils"
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible"

type TreeContextValue = {
  expandedIds: string[]
  toggleExpanded: (id: string) => void
  selectedIds: string[]
  selectId: (id: string, e?: React.MouseEvent) => void
  multiSelect: boolean
  showLines: boolean
  onSelectionChange?: (ids: string[]) => void
}

const TreeContext = React.createContext<TreeContextValue | null>(null)

function useTree(): TreeContextValue {
  const ctx = React.useContext(TreeContext)
  if (!ctx) throw new Error("Tree components must be used within <TreeProvider>.")
  return ctx
}

type TreeNodeContextValue = {
  nodeId: string
  level: number
  isLast: boolean
}

const TreeNodeContext = React.createContext<TreeNodeContextValue | null>(null)

function useTreeNode(): TreeNodeContextValue {
  const ctx = React.useContext(TreeNodeContext)
  if (!ctx) throw new Error("Tree node components must be used within <TreeNode>.")
  return ctx
}

export type TreeProviderProps = {
  children: React.ReactNode
  defaultExpandedIds?: string[]
  expandedIds?: string[]
  onExpandedChange?: (ids: string[]) => void

  defaultSelectedIds?: string[]
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void

  multiSelect?: boolean
  showLines?: boolean
}

export function TreeProvider({
  children,
  defaultExpandedIds = [],
  expandedIds,
  onExpandedChange,
  defaultSelectedIds = [],
  selectedIds,
  onSelectionChange,
  multiSelect = false,
  showLines = true,
}: TreeProviderProps) {
  const [uncontrolledExpanded, setUncontrolledExpanded] = React.useState<string[]>(defaultExpandedIds)
  const [uncontrolledSelected, setUncontrolledSelected] = React.useState<string[]>(defaultSelectedIds)

  const effectiveExpanded = expandedIds ?? uncontrolledExpanded
  const effectiveSelected = selectedIds ?? uncontrolledSelected

  const setExpanded = React.useCallback(
    (next: string[]) => {
      if (expandedIds) onExpandedChange?.(next)
      else setUncontrolledExpanded(next)
    },
    [expandedIds, onExpandedChange]
  )

  const setSelected = React.useCallback(
    (next: string[]) => {
      onSelectionChange?.(next)
      if (!selectedIds) setUncontrolledSelected(next)
    },
    [onSelectionChange, selectedIds]
  )

  const toggleExpanded = React.useCallback(
    (id: string) => {
      setExpanded(
        effectiveExpanded.includes(id)
          ? effectiveExpanded.filter((x) => x !== id)
          : [...effectiveExpanded, id]
      )
    },
    [effectiveExpanded, setExpanded]
  )

  const selectId = React.useCallback(
    (id: string, e?: React.MouseEvent) => {
      if (!multiSelect) {
        setSelected([id])
        return
      }

      const isMultiGesture = !!e && (e.metaKey || e.ctrlKey)
      if (!isMultiGesture) {
        setSelected([id])
        return
      }

      setSelected(
        effectiveSelected.includes(id)
          ? effectiveSelected.filter((x) => x !== id)
          : [...effectiveSelected, id]
      )
    },
    [effectiveSelected, multiSelect, setSelected]
  )

  const value = React.useMemo<TreeContextValue>(
    () => ({
      expandedIds: effectiveExpanded,
      toggleExpanded,
      selectedIds: effectiveSelected,
      selectId,
      multiSelect,
      showLines,
      onSelectionChange,
    }),
    [effectiveExpanded, toggleExpanded, effectiveSelected, selectId, multiSelect, showLines, onSelectionChange]
  )

  return <TreeContext.Provider value={value}>{children}</TreeContext.Provider>
}

export function TreeView({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      role="tree"
      className={cn("flex flex-col gap-0.5", className)}
      {...props}
    />
  )
}

export type TreeNodeProps = {
  nodeId: string
  level?: number
  isLast?: boolean
  className?: string
  children: React.ReactNode
}

export function TreeNode({
  nodeId,
  level = 0,
  isLast = false,
  className,
  children,
}: TreeNodeProps) {
  const { expandedIds } = useTree()
  const open = expandedIds.includes(nodeId)

  // Memoize context value to prevent unnecessary child re-renders
  // **Validates: Requirements 8.3, Property 30: Context Provider Memoization**
  const contextValue = React.useMemo(
    () => ({ nodeId, level, isLast }),
    [nodeId, level, isLast]
  )

  return (
    <TreeNodeContext.Provider value={contextValue}>
      <Collapsible open={open}>
        <div className={cn("flex flex-col", className)}>{children}</div>
      </Collapsible>
    </TreeNodeContext.Provider>
  )
}

export function TreeNodeTrigger({
  className,
  children,
  hasChildren,
  expandOnClick = true,
  ...props
}: React.ComponentProps<"button"> & { hasChildren?: boolean; expandOnClick?: boolean }) {
  const { nodeId, level } = useTreeNode()
  const { expandedIds, toggleExpanded, selectedIds, selectId } = useTree()
  const selected = selectedIds.includes(nodeId)
  const open = expandedIds.includes(nodeId)

  return (
    <button
      type="button"
      role="treeitem"
      aria-selected={selected}
      aria-expanded={hasChildren ? open : undefined}
      data-selected={selected ? "true" : "false"}
      onClick={(e) => {
        if (hasChildren && expandOnClick) toggleExpanded(nodeId)
        selectId(nodeId, e)
      }}
      className={cn(
        "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-all duration-150",
        "hover:bg-muted/50",
        "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        selected && "bg-accent/50",
        className
      )}
      style={{ paddingLeft: `calc(${level} * 0.75rem + 0.5rem)` }}
      {...props}
    >
      {children}
    </button>
  )
}

export function TreeNodeContent({
  className,
  children,
  hasChildren,
  ...props
}: React.ComponentProps<typeof CollapsibleContent> & { hasChildren?: boolean }) {
  const { level } = useTreeNode()
  const { showLines } = useTree()

  if (!hasChildren) return null

  return (
    <CollapsibleContent
      className={cn(
        "data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "mt-0.5 flex flex-col gap-0.5",
          showLines && "border-l border-border/40",
        )}
        style={{ marginLeft: `calc(${level} * 0.75rem + 1.15rem)`, paddingLeft: showLines ? "0.75rem" : undefined }}
      >
        {children}
      </div>
    </CollapsibleContent>
  )
}

export function TreeExpander({
  className,
  hasChildren,
  ...props
}: React.ComponentProps<"button"> & { hasChildren?: boolean }) {
  const { nodeId } = useTreeNode()
  const { expandedIds, toggleExpanded } = useTree()
  const open = expandedIds.includes(nodeId)

  if (!hasChildren) {
    return <span className={cn("inline-flex h-5 w-5 shrink-0", className)} />
  }

  return (
    <button
      type="button"
      aria-label={open ? "Collapse" : "Expand"}
      onClick={(e) => {
        e.stopPropagation()
        toggleExpanded(nodeId)
      }}
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors",
        "hover:text-foreground",
        className
      )}
      {...props}
    >
      <ChevronRight className={cn("h-5 w-5 transition-transform duration-200", open && "rotate-90")} />
    </button>
  )
}

export function TreeIcon({
  className,
  icon,
  hasChildren,
  isFolder,
}: {
  className?: string
  icon?: React.ReactNode
  hasChildren?: boolean
  isFolder?: boolean
}) {
  const { nodeId } = useTreeNode()
  const { expandedIds } = useTree()
  const open = expandedIds.includes(nodeId)

  // Use isFolder if provided, otherwise fall back to hasChildren for backwards compatibility
  const showFolderIcon = isFolder ?? hasChildren

  const fallback = showFolderIcon
    ? (open ? <FolderOpen className="h-5 w-5 text-amber-500" /> : <Folder className="h-5 w-5 text-amber-500/80" />)
    : <FileIcon className="h-5 w-5 text-muted-foreground" />

  return <span className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center", className)}>{icon ?? fallback}</span>
}

export function TreeLabel({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return <span className={cn("truncate", className)} {...props} />
}
