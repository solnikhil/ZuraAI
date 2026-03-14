import type { Locator, Page } from 'playwright'

import type { TargetRef } from '../../src/testing/types'

function parseRoleTarget(value: string): { role: string; name?: string } {
  const [rolePart, ...nameParts] = value.split('|')
  const role = rolePart?.trim()
  const name = nameParts.join('|').trim()

  if (!role) {
    throw new Error('Role target must include a non-empty role name.')
  }

  return name ? { role, name } : { role }
}

export function describeTargetRef(target: TargetRef): string {
  return `${target.by}=${target.value}`
}

export function getLocatorForTarget(page: Page, target: TargetRef): Locator {
  switch (target.by) {
    case 'role': {
      const { role, name } = parseRoleTarget(target.value)
      return page.getByRole(role as Parameters<Page['getByRole']>[0], name ? { name } : undefined)
    }
    case 'label':
      return page.getByLabel(target.value)
    case 'text':
      return page.getByText(target.value, { exact: false })
    case 'placeholder':
      return page.getByPlaceholder(target.value)
    case 'testId':
      return page.getByTestId(target.value)
    case 'css':
      return page.locator(target.value)
    default:
      throw new Error(`Unsupported target strategy: ${(target as TargetRef).by}`)
  }
}
