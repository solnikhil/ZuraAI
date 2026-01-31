import * as React from 'react'
import { Check, Copy, FileCode2, FileJson, FileText } from 'lucide-react'

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
            <TreeNodeTrigger className="font-mono text-[13px]">
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
  const [copied, setCopied] = React.useState(false)

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
    <div className={cn('my-3 overflow-hidden rounded-lg border border-border bg-muted/20', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border bg-background/40 px-3 py-2">
        <div className="text-xs font-medium text-muted-foreground">Directory</div>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground transition-colors',
            'hover:text-foreground'
          )}
          onClick={() => {
            navigator.clipboard.writeText(content)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          }}
          title={copied ? 'Copied!' : 'Copy'}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="p-2">
        <TreeProvider defaultExpandedIds={defaultExpandedIds}>
          <TreeView>
            <TreeNodes nodes={nodes} level={0} />
          </TreeView>
        </TreeProvider>
      </div>
    </div>
  )
}
