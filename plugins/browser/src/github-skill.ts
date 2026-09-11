import { readFileSync } from 'node:fs'

const folder = new URL('../skills/deepdeck-webmcp-github/', import.meta.url)
const markdown = readFileSync(new URL('SKILL.md', folder), 'utf8')
export const WEBMCP_GITHUB_SKILL = Object.freeze({
  name: 'deepdeck-webmcp-github',
  description: 'Publish this site’s WebMCP to GitHub, contribute repairs through upstream pull requests, publish releases, or submit it to the WebMCP directory. Use existing GitHub authentication.',
  source: 'runtime' as const,
  invocation: Object.freeze({ modelInvocable: true as const, userInvocable: true as const }),
  content: `${markdown.replace(/^---\n[\s\S]*?\n---\n/u, '').replace('[repository-contract.md](references/repository-contract.md)', 'the Repository contract appended below')}\n\n## Repository contract\n\n${readFileSync(new URL('references/repository-contract.md', folder), 'utf8')}`,
})
