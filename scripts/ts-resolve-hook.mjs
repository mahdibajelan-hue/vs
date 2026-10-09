// Resolve extensionless relative imports to .ts files so pure TS libs can be tested with plain `node`.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
    const base = new URL(specifier, context.parentURL)
    for (const ext of ['.ts', '/index.ts']) {
      const u = new URL(base.href + ext)
      if (existsSync(fileURLToPath(u))) return next(u.href, context)
    }
  }
  return next(specifier, context)
}
