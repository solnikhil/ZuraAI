import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let mockHome = ''

vi.mock('electron', () => ({
  app: {
    getPath: () => mockHome,
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
}))

vi.mock('os', () => ({
  default: {
    homedir: () => mockHome,
  },
  homedir: () => mockHome,
}))

async function writeSkill(root: string, folder: string, content: string): Promise<string> {
  const skillDir = path.join(root, '.agents', 'skills', folder)
  await mkdir(skillDir, { recursive: true })
  await writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf8')
  return skillDir
}

describe('Agent Skills service', () => {
  beforeEach(async () => {
    mockHome = await mkdtemp(path.join(tmpdir(), 'zura-skills-home-'))
    vi.resetModules()
  })

  it('discovers valid SKILL.md files and parses optional frontmatter fields', async () => {
    await writeSkill(
      mockHome,
      'design',
      `---
name: design-review
description: Review UI quality
license: MIT
compatibility: codex
allowed-tools: browser
metadata:
  owner: design
---
Use this for interface review.
`
    )

    const { listAgentSkills } = await import('./service')
    const result = await listAgentSkills()

    expect(result.skills).toHaveLength(1)
    expect(result.skills[0]).toMatchObject({
      name: 'design-review',
      description: 'Review UI quality',
      license: 'MIT',
      compatibility: 'codex',
      allowedTools: 'browser',
      metadata: { owner: 'design' },
      scope: 'user',
    })
  })

  it('reports malformed or incomplete SKILL.md files without crashing discovery', async () => {
    await writeSkill(
      mockHome,
      'missing-description',
      `---
name: incomplete
---
No description.
`
    )
    await writeSkill(
      mockHome,
      'bad-frontmatter',
      `---
name: broken
description: Broken skill
not yaml
---
Body.
`
    )

    const { listAgentSkills } = await import('./service')
    const result = await listAgentSkills()

    expect(result.skills.map((skill) => skill.name)).toEqual(['broken'])
    expect(result.skills[0].diagnostics?.[0].message).toContain('Unsupported frontmatter line')
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.message.includes('name and description'))
    ).toBe(true)
  })

  it('lets project skills override user skills by name and filters disabled skills', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'zura-skills-project-'))
    await writeSkill(
      mockHome,
      'shared',
      `---
name: shared
description: User copy
---
User body.
`
    )
    await writeSkill(
      projectRoot,
      'shared',
      `---
name: shared
description: Project copy
---
Project body.
`
    )
    await writeSkill(
      mockHome,
      'disabled',
      `---
name: disabled
description: Hidden copy
---
Hidden body.
`
    )

    const { listAgentSkills } = await import('./service')
    const result = await listAgentSkills({ projectRoot, disabledSkillNames: ['disabled'] })

    expect(
      result.skills.map((skill) => `${skill.name}:${skill.scope}:${skill.description}`)
    ).toEqual(['shared:project:Project copy'])
  })

  it('activates a skill with body-only instructions and capped relative resource paths', async () => {
    const skillDir = await writeSkill(
      mockHome,
      'writer',
      `---
name: writer
description: Write with house style
---
# Instructions
Use the house style.
`
    )
    await mkdir(path.join(skillDir, 'references'), { recursive: true })
    await mkdir(path.join(skillDir, 'scripts'), { recursive: true })
    for (let index = 0; index < 90; index += 1) {
      await writeFile(
        path.join(skillDir, 'scripts', `tool-${index}.js`),
        'console.log("skip")',
        'utf8'
      )
    }
    await writeFile(path.join(skillDir, 'references', 'style.md'), 'Style guide', 'utf8')

    const { activateAgentSkill } = await import('./service')
    const result = await activateAgentSkill('writer')

    expect(result.content).toContain('<skill_content name="writer">')
    expect(result.content).toContain('# Instructions')
    expect(result.content).not.toContain('description: Write with house style')
    expect(result.resources).toHaveLength(80)
    expect(result.resources[0]).toMatch(/^scripts\/tool-/)
    expect(result.resources.every((resource) => !path.isAbsolute(resource))).toBe(true)
  })
})
