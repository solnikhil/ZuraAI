import * as React from 'react'
import {
  FileCode2,
  FileJson,
  FileText,
  FileType,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileSpreadsheet,
  FileCog,
  FileTerminal,
  FileKey,
  Database,
} from 'lucide-react'

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

const EXT_ICONS: Record<string, React.ReactNode> = {
  // TypeScript - blue
  '.ts': <FileCode2 className="h-5 w-5 text-blue-400" />,
  '.tsx': <FileCode2 className="h-5 w-5 text-blue-400" />,
  // JavaScript - yellow
  '.js': <FileCode2 className="h-5 w-5 text-yellow-400" />,
  '.jsx': <FileCode2 className="h-5 w-5 text-yellow-400" />,
  // Python - green/yellow
  '.py': <FileCode2 className="h-5 w-5 text-emerald-400" />,
  // Ruby - red
  '.rb': <FileCode2 className="h-5 w-5 text-red-400" />,
  // Go - cyan
  '.go': <FileCode2 className="h-5 w-5 text-cyan-400" />,
  // Rust - orange
  '.rs': <FileCode2 className="h-5 w-5 text-orange-400" />,
  // Java - red/orange
  '.java': <FileCode2 className="h-5 w-5 text-red-500" />,
  '.kt': <FileCode2 className="h-5 w-5 text-purple-400" />,
  '.swift': <FileCode2 className="h-5 w-5 text-orange-500" />,
  // C/C++ - blue
  '.c': <FileCode2 className="h-5 w-5 text-blue-500" />,
  '.cpp': <FileCode2 className="h-5 w-5 text-blue-500" />,
  '.h': <FileCode2 className="h-5 w-5 text-purple-400" />,
  '.hpp': <FileCode2 className="h-5 w-5 text-purple-400" />,
  // C# - purple
  '.cs': <FileCode2 className="h-5 w-5 text-violet-500" />,
  // PHP - indigo
  '.php': <FileCode2 className="h-5 w-5 text-indigo-400" />,
  // Vue - green
  '.vue': <FileCode2 className="h-5 w-5 text-emerald-500" />,
  // Svelte - orange
  '.svelte': <FileCode2 className="h-5 w-5 text-orange-500" />,

  // Data/config - yellow/amber
  '.json': <FileJson className="h-5 w-5 text-yellow-500" />,
  '.yaml': <FileCog className="h-5 w-5 text-rose-400" />,
  '.yml': <FileCog className="h-5 w-5 text-rose-400" />,
  '.toml': <FileCog className="h-5 w-5 text-gray-400" />,
  '.ini': <FileCog className="h-5 w-5 text-gray-400" />,
  '.env': <FileKey className="h-5 w-5 text-yellow-600" />,

  // Styles - pink/magenta
  '.css': <FileType className="h-5 w-5 text-sky-400" />,
  '.scss': <FileType className="h-5 w-5 text-pink-400" />,
  '.sass': <FileType className="h-5 w-5 text-pink-400" />,
  '.less': <FileType className="h-5 w-5 text-indigo-400" />,

  // Markup/docs
  '.html': <FileCode2 className="h-5 w-5 text-orange-500" />,
  '.htm': <FileCode2 className="h-5 w-5 text-orange-500" />,
  '.xml': <FileCode2 className="h-5 w-5 text-orange-400" />,
  '.md': <FileText className="h-5 w-5 text-sky-400" />,
  '.mdx': <FileText className="h-5 w-5 text-sky-400" />,
  '.txt': <FileText className="h-5 w-5 text-gray-400" />,
  '.rst': <FileText className="h-5 w-5 text-gray-400" />,

  // Shell/scripts - green
  '.sh': <FileTerminal className="h-5 w-5 text-green-500" />,
  '.bash': <FileTerminal className="h-5 w-5 text-green-500" />,
  '.zsh': <FileTerminal className="h-5 w-5 text-green-500" />,
  '.fish': <FileTerminal className="h-5 w-5 text-green-400" />,
  '.ps1': <FileTerminal className="h-5 w-5 text-blue-500" />,
  '.bat': <FileTerminal className="h-5 w-5 text-green-600" />,
  '.cmd': <FileTerminal className="h-5 w-5 text-green-600" />,

  // Images - purple/magenta
  '.png': <FileImage className="h-5 w-5 text-purple-400" />,
  '.jpg': <FileImage className="h-5 w-5 text-purple-400" />,
  '.jpeg': <FileImage className="h-5 w-5 text-purple-400" />,
  '.gif': <FileImage className="h-5 w-5 text-purple-400" />,
  '.svg': <FileImage className="h-5 w-5 text-amber-500" />,
  '.webp': <FileImage className="h-5 w-5 text-purple-400" />,
  '.ico': <FileImage className="h-5 w-5 text-purple-400" />,
  '.bmp': <FileImage className="h-5 w-5 text-purple-400" />,

  // Video - red
  '.mp4': <FileVideo className="h-5 w-5 text-red-400" />,
  '.webm': <FileVideo className="h-5 w-5 text-red-400" />,
  '.mov': <FileVideo className="h-5 w-5 text-red-400" />,
  '.avi': <FileVideo className="h-5 w-5 text-red-400" />,
  '.mkv': <FileVideo className="h-5 w-5 text-red-400" />,

  // Audio - pink
  '.mp3': <FileAudio className="h-5 w-5 text-pink-500" />,
  '.wav': <FileAudio className="h-5 w-5 text-pink-500" />,
  '.ogg': <FileAudio className="h-5 w-5 text-pink-500" />,
  '.flac': <FileAudio className="h-5 w-5 text-pink-500" />,
  '.m4a': <FileAudio className="h-5 w-5 text-pink-500" />,

  // Archives - brown/amber
  '.zip': <FileArchive className="h-5 w-5 text-amber-600" />,
  '.tar': <FileArchive className="h-5 w-5 text-amber-600" />,
  '.gz': <FileArchive className="h-5 w-5 text-amber-600" />,
  '.rar': <FileArchive className="h-5 w-5 text-amber-600" />,
  '.7z': <FileArchive className="h-5 w-5 text-amber-600" />,

  // Data - green
  '.csv': <FileSpreadsheet className="h-5 w-5 text-green-500" />,
  '.xlsx': <FileSpreadsheet className="h-5 w-5 text-green-600" />,
  '.xls': <FileSpreadsheet className="h-5 w-5 text-green-600" />,
  '.sql': <Database className="h-5 w-5 text-blue-400" />,
  '.db': <Database className="h-5 w-5 text-blue-400" />,
  '.sqlite': <Database className="h-5 w-5 text-blue-400" />,

  // Security - gold
  '.pem': <FileKey className="h-5 w-5 text-yellow-500" />,
  '.key': <FileKey className="h-5 w-5 text-yellow-500" />,
  '.crt': <FileKey className="h-5 w-5 text-yellow-500" />,
  '.cer': <FileKey className="h-5 w-5 text-yellow-500" />,
}

function iconForLeaf(node: FileTreeNode): React.ReactNode {
  const name = node.name.toLowerCase()
  const ext = name.slice(name.lastIndexOf('.'))
  return EXT_ICONS[ext] || <FileText className="h-5 w-5 text-slate-400" />
}

function TreeNodes({ nodes, level }: { nodes: FileTreeNode[]; level: number }) {
  return (
    <>
      {nodes.map((node, idx) => {
        const hasChildren = !!node.children && node.children.length > 0
        const isFolder = node.type === 'folder'
        const isLast = idx === nodes.length - 1

        return (
          <TreeNode key={node.id} nodeId={node.id} level={level} isLast={isLast}>
             <TreeNodeTrigger className="font-mono text-sm [&[data-selected=true]]:bg-transparent" hasChildren={hasChildren}>
              <TreeExpander hasChildren={hasChildren} />
              <TreeIcon isFolder={isFolder} icon={!isFolder ? iconForLeaf(node) : undefined} />
              <div className="min-w-0 flex flex-1 items-center gap-3">
                <TreeLabel className="min-w-0 truncate">{isFolder ? `${node.name}/` : node.name}</TreeLabel>
                {node.description && (
                  <span className="ml-auto min-w-0 truncate text-[11px] italic text-muted-foreground/70 font-normal">
                    {node.description}
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

  // Get root folder name for the title
  const rootName = nodes[0]?.name || 'Project'

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    margin: '2px 0',
    borderRadius: '30px',
    overflow: 'hidden',
    border: '1px solid #3A3C40',
    background: '#252729',
    boxShadow: 'none',
  }

  return (
    <div style={containerStyle} className={cn('mb-1', className)}>
      {/* Tree content */}
      <div style={{ padding: '14px 16px 18px' }}>
        <TreeProvider
          defaultExpandedIds={defaultExpandedIds}
          onSelectionChange={() => {}}
        >
          <TreeView>
            <TreeNodes nodes={nodes} level={0} />
          </TreeView>
        </TreeProvider>
      </div>
    </div>
  )
}
