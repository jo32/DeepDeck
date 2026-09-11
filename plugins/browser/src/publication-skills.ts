import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Snapshot only this site's project skills; never follow links into user/global skills. */
export async function exportSiteSkills(workspace: string, destination: string) {
  const files: Array<{ path: string; sha256: string }> = []
  let bytes = 0
  const copy = async (path: string, depth: number): Promise<void> => {
    if (depth > 10 || files.length >= 200) throw new Error('Site skills exceed the publication file limit.')
    const source = join(workspace, path)
    const stat = await lstat(source)
    if (stat.isSymbolicLink()) throw new Error(`Review the linked skill before publication: ${path}`)
    if (stat.isDirectory()) {
      for (const name of (await readdir(source)).sort()) {
        if (['.git', 'node_modules', '.env'].includes(name)) throw new Error(`Remove private or generated skill content before publication: ${path}/${name}`)
        await copy(`${path}/${name}`, depth + 1)
      }
    } else {
      if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error(`Unsupported skill file: ${path}`)
      const content = await readFile(source)
      bytes += content.length
      if (bytes > 10 * 1024 * 1024) throw new Error('Site skills exceed the publication size limit.')
      await mkdir(dirname(join(destination, path)), { recursive: true })
      await writeFile(join(destination, path), content, { flag: 'wx', mode: stat.mode & 0o100 ? 0o700 : 0o600 })
      files.push({ path, sha256: createHash('sha256').update(content).digest('hex') })
    }
  }
  for (const base of ['.agents', '.dsh']) {
    for (const relative of [base, `${base}/skills`]) {
      const stat = await lstat(join(workspace, relative)).catch(error => { if (error.code === 'ENOENT') return undefined; throw error })
      if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error(`Use a local project skill directory for publication: ${relative}`)
    }
    const root = `${base}/skills`
    const names = await readdir(join(workspace, root)).catch(error => { if (error.code === 'ENOENT') return []; throw error })
    for (const name of names.sort()) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(name)) throw new Error(`Invalid site skill directory: ${name}`)
      const folder = await lstat(join(workspace, root, name))
      if (!folder.isDirectory() || folder.isSymbolicLink()) throw new Error(`Use an ordinary site skill directory: ${name}`)
      const entry = await lstat(join(workspace, root, name, 'SKILL.md'))
      if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`Missing ordinary SKILL.md: ${name}`)
      await copy(`${root}/${name}`, 0)
    }
  }
  return { snapshot: 'current-site-workspace' as const, files }
}
