export async function writeTextToClipboard(text: string): Promise<boolean> {
  const normalizedText = typeof text === 'string' ? text : String(text ?? '')

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(normalizedText)
      return true
    }
  } catch {
    // Fall through to the execCommand fallback.
  }

  let textarea: HTMLTextAreaElement | null = null
  try {
    textarea = document.createElement('textarea')
    textarea.value = normalizedText
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    textarea.style.left = '-9999px'
    textarea.style.opacity = '0'
    textarea.setAttribute('readonly', '')

    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)

    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    if (textarea && textarea.parentNode) {
      textarea.parentNode.removeChild(textarea)
    }
  }
}
