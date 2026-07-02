import { useContext, useState } from 'react'
import { Activity, Copy } from 'lucide-react'
import { performanceDiagnostics } from '@/dev/performanceDiagnostics'
import { writeTextToClipboard } from '@/utils/clipboard'
import { ToastContext } from '@/components/shared/Toast'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type PerformanceReportButtonProps = {
  className?: string
}

export default function PerformanceReportButton({ className }: PerformanceReportButtonProps) {
  const [copied, setCopied] = useState(false)
  const toastContext = useContext(ToastContext)

  if (!import.meta.env.DEV) return null

  const copyReport = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const ok = await writeTextToClipboard(performanceDiagnostics.copyableReport())
    setCopied(ok)
    toastContext?.showToast(
      ok ? 'Performance report copied' : 'Could not copy performance report',
      ok ? 'success' : 'error'
    )

    if (ok) {
      window.setTimeout(() => setCopied(false), 1600)
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            'theme-control-btn inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold text-[var(--theme-text-muted)]',
            copied && 'text-[var(--theme-text-primary)]',
            className
          )}
          onClick={copyReport}
          aria-label="Copy performance report"
        >
          <Activity size={14} aria-hidden="true" />
          <span>{copied ? 'Copied' : 'Copy Perf'}</span>
          <Copy size={12} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="rounded-full">
        Copy 30s performance report
      </TooltipContent>
    </Tooltip>
  )
}
