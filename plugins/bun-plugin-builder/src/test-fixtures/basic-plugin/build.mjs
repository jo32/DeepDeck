import { mkdir, writeFile } from 'node:fs/promises'

await mkdir('lib', { recursive: true })
await writeFile('lib/index.js', 'export const name = \'deepdeck-bun-smoke\'\nexport function apply() {}\n')
console.log('built smoke fixture')
