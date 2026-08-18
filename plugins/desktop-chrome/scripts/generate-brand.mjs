import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(pluginRoot, '../..')
const manifestPath = resolve(repositoryRoot, 'branding/brand.json')
const manifestDirectory = dirname(manifestPath)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

const required = (field) => {
  const value = manifest[field]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`branding field ${field} must be a non-empty string`)
  }
  return value.trim()
}

const mimeTypes = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
}

const dataUrl = (field) => {
  const path = resolve(manifestDirectory, required(field))
  const assetRelativePath = relative(manifestDirectory, path)
  if (assetRelativePath.startsWith('..') || resolve(manifestDirectory, assetRelativePath) !== path) {
    throw new Error(`branding asset ${field} must stay inside ${manifestDirectory}`)
  }
  const mime = mimeTypes[extname(path).toLowerCase()]
  if (mime === undefined) throw new Error(`unsupported branding asset: ${path}`)
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`
}

const brand = {
  id: required('id'),
  name: required('name'),
  attribution: required('attribution'),
  tagline: required('tagline'),
  accentColor: required('accentColor'),
  accentColorSoft: required('accentColorSoft'),
  wordmarkDataUrl: dataUrl('wordmark'),
  markDataUrl: dataUrl('mark'),
  faviconDataUrl: dataUrl('favicon'),
}

if (!/^[a-z0-9][a-z0-9-]*$/.test(brand.id)) throw new Error('branding id is invalid')
for (const field of ['accentColor', 'accentColorSoft']) {
  if (!/^#[0-9a-f]{6}$/i.test(brand[field])) throw new Error(`branding ${field} is invalid`)
}

const output = `/** Generated from branding/brand.json. Do not edit directly. */\nexport const BRAND = Object.freeze(${JSON.stringify(brand, null, 2)})\n`
writeFileSync(resolve(pluginRoot, 'src/client/generated-brand.ts'), output)
