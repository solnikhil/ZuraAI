export interface NotificationEmailTemplateInput {
  notificationType: string
  title: string
  summary: string
  notificationMessage: string
  detailTitle?: string
  detailItems?: string[]
  metadata?: Array<{
    label: string
    value: string
    hint?: string
  }>
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderParagraphs(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 10px;color:#334155;font-size:15px;line-height:1.55;">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`
    )
    .join('')
}

function renderMetadata(metadata: NotificationEmailTemplateInput['metadata']): string {
  if (!metadata || metadata.length === 0) return ''

  const cells = metadata
    .slice(0, 3)
    .map(
      (item) => `
    <td style="width:33.33%;padding:0 8px 0 0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;background:#ffffff;border-radius:6px;">
        <tr>
          <td style="padding:16px;">
            <div style="font-size:13px;line-height:1.3;font-weight:700;color:#020617;">${escapeHtml(item.value)}</div>
            <div style="margin-top:6px;font-size:11px;line-height:1.3;color:#64748b;">${escapeHtml(item.label)}</div>
            ${item.hint ? `<div style="margin-top:6px;font-size:11px;line-height:1.3;color:#64748b;">${escapeHtml(item.hint)}</div>` : ''}
          </td>
        </tr>
      </table>
    </td>
  `
    )
    .join('')

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;">
      <tr>${cells}</tr>
    </table>
  `
}

function renderDetails(title: string | undefined, items: string[] | undefined): string {
  if (!items || items.length === 0) return ''

  const listItems = items
    .map(
      (item) => `
    <li style="margin:0 0 8px;color:#334155;font-size:14px;line-height:1.5;">${escapeHtml(item)}</li>
  `
    )
    .join('')

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;border:1px solid #e5e7eb;background:#fafafa;border-radius:14px;">
      <tr>
        <td style="padding:18px 20px;">
          <div style="margin:0 0 12px;color:#111827;font-size:13px;font-weight:800;letter-spacing:0.02em;text-transform:uppercase;">${escapeHtml(title || 'Details')}</div>
          <ul style="margin:0;padding-left:18px;">${listItems}</ul>
        </td>
      </tr>
    </table>
  `
}

export function buildNotificationEmailHtml(input: NotificationEmailTemplateInput): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0;">${escapeHtml(input.summary)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:22px;box-shadow:0 18px 45px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:28px 30px 26px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <table role="presentation" cellspacing="0" cellpadding="0">
                        <tr>
                          <td style="width:42px;height:42px;border-radius:999px;background:#111827;color:#ffffff;text-align:center;font-size:21px;font-weight:800;vertical-align:middle;">Z</td>
                          <td style="padding-left:12px;">
                            <div style="font-size:14px;line-height:1.2;font-weight:800;color:#111827;">ZuraAI</div>
                            <div style="margin-top:3px;font-size:12px;line-height:1.2;color:#6b7280;">Automation alert</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <div style="margin-top:24px;color:#2563eb;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(input.notificationType)}</div>
                <h1 style="margin:12px 0 10px;color:#111827;font-size:26px;line-height:1.18;font-weight:800;">${escapeHtml(input.title)}</h1>
                <div style="margin:0;">${renderParagraphs(input.notificationMessage || input.summary)}</div>
                ${renderMetadata(input.metadata)}

                ${renderDetails(input.detailTitle, input.detailItems)}

                <div style="margin-top:22px;border-top:1px solid #eef2f7;padding-top:16px;color:#6b7280;font-size:11px;line-height:1.45;">
                  Sent by ZuraAI. Manage email alerts in Settings &gt; Notifications.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export const __test__ = {
  escapeHtml,
}
