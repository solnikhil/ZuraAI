import * as React from 'react'
import { FileCode2, FileJson, FileText } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  TreeProvider,
  TreeView,
  TreeNode,
  TreeNodeTrigger,
  TreeNodeContent,
  TreeExpander,
  TreeIcon,
  TreeLabel,
} from '@/components/ui/tree'
import { parseFileTreeBlock, type FileTreeNode } from '@/utils/fileTreeParser'

function collectExpandedIds(nodes: FileTreeNode[], maxDepth: number): string[] {
  const ids: string[] = []
  const walk = (ns: FileTreeNode[], depth: number) => {
    for (const n of ns) {
      if (n.children && n.children.length > 0 && depth < maxDepth) {
        ids.push(n.id)
        walk(n.children, depth + 1)
      }
    }
  }
  walk(nodes, 0)
  return ids
}

function iconForLeaf(node: FileTreeNode): React.ReactNode {
  const name = node.name.toLowerCase()
  if (name.endsWith('.json')) return <FileJson className="h-4 w-4" />
  if (name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.js') || name.endsWith('.jsx')) {
    return <FileCode2 className="h-4 w-4" />
  }
  return <FileText className="h-4 w-4" />
}

function TreeNodes({ nodes, level }: { nodes: FileTreeNode[]; level: number }) {
  return (
    <>
      {nodes.map((node, idx) => {
        const hasChildren = !!node.children && node.children.length > 0
        const isLast = idx === nodes.length - 1

        return (
          <TreeNode key={node.id} nodeId={node.id} level={level} isLast={isLast}>
            <TreeNodeTrigger className="font-mono text-[13px]" hasChildren={hasChildren}>
              <TreeExpander hasChildren={hasChildren} />
              <TreeIcon hasChildren={hasChildren} icon={!hasChildren ? iconForLeaf(node) : undefined} />
              <div className="min-w-0 flex flex-1 items-center gap-3">
                <TreeLabel className="min-w-0 truncate">{node.type === 'folder' ? `${node.name}/` : node.name}</TreeLabel>
                {node.description && (
                  <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
                    # {node.description}
                  </span>
                )}
              </div>
            </TreeNodeTrigger>

            {hasChildren && (
              <TreeNodeContent hasChildren>
                <TreeNodes nodes={node.children!} level={level + 1} />
              </TreeNodeContent>
            )}
          </TreeNode>
        )
      })}
    </>
  )
}

export default function MarkdownFileTree({
  language,
  content,
  className,
}: {
  language?: string
  content: string
  className?: string
}) {
  const nodes = React.useMemo(() => {
    try {
      return parseFileTreeBlock(language, content)
    } catch {
      return []
    }
  }, [language, content])

  const defaultExpandedIds = React.useMemo(() => collectExpandedIds(nodes, 2), [nodes])

  if (!nodes || nodes.length === 0) {
    return (
      <pre className={cn('overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 text-sm', className)}>
        <code>{content}</code>
      </pre>
    )
  }

  return (
    <div className={cn('relative my-2', className)}>
      <div className="pointer-events-none absolute left-0 top-0 flex items-center gap-2 px-1 py-1">
        <span className="text-xs font-medium text-muted-foreground">Directory</span>
      </div>
      <div className="pt-6">
        <TreeProvider defaultExpandedIds={defaultExpandedIds}>
          <TreeView>
            <TreeNodes nodes={nodes} level={0} />
          </TreeView>
        </TreeProvider>
      </div>
    </div>
  )
}
