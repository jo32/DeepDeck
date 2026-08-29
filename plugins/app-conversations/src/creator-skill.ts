import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEEPDECK_VIBE_APP_SKILL_NAME = 'deepdeck-vibe-app-development' as const

export interface CreatorSkillRegistration {
  readonly name: typeof DEEPDECK_VIBE_APP_SKILL_NAME
  readonly description: string
  readonly content: string
  readonly path: string
  readonly resourceBase: { readonly kind: 'directory'; readonly path: string }
  readonly source: 'runtime'
  readonly invocation: { readonly modelInvocable: true; readonly userInvocable: true }
}

function frontmatterValue(frontmatter: string, key: string): string {
  const prefix = `${key}:`
  const line = frontmatter.split(/\r?\n/u).find(candidate => candidate.startsWith(prefix))
  if (line === undefined) throw new Error(`Bundled Creator Skill is missing '${key}' frontmatter.`)
  const value = line.slice(prefix.length).trim()
  if (value.length === 0) throw new Error(`Bundled Creator Skill has empty '${key}' frontmatter.`)
  return value
}

function loadCreatorSkill(): CreatorSkillRegistration {
  const path = fileURLToPath(new URL('../skills/deepdeck-vibe-app-development/SKILL.md', import.meta.url))
  const document = readFileSync(path, 'utf8')
  const match = /^---\r?\n(?<frontmatter>[\s\S]*?)\r?\n---\r?\n(?<content>[\s\S]+)$/u.exec(document)
  if (match?.groups === undefined) throw new Error('Bundled Creator Skill has invalid frontmatter framing.')
  const name = frontmatterValue(match.groups.frontmatter ?? '', 'name')
  if (name !== DEEPDECK_VIBE_APP_SKILL_NAME) {
    throw new Error(`Bundled Creator Skill name must be '${DEEPDECK_VIBE_APP_SKILL_NAME}'.`)
  }
  const content = match.groups.content?.trim()
  if (content === undefined || content.length === 0) throw new Error('Bundled Creator Skill has no instructions.')
  return Object.freeze({
    name: DEEPDECK_VIBE_APP_SKILL_NAME,
    description: frontmatterValue(match.groups.frontmatter ?? '', 'description'),
    content,
    path,
    resourceBase: Object.freeze({ kind: 'directory' as const, path: dirname(path) }),
    source: 'runtime' as const,
    invocation: Object.freeze({ modelInvocable: true as const, userInvocable: true as const }),
  })
}

export const DEEPDECK_VIBE_APP_SKILL = loadCreatorSkill()
