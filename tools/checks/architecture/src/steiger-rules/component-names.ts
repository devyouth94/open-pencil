import path from 'node:path'

import { collectFiles, type Diagnostic, relativePath, type Rule } from './support.ts'

/**
 * App components that share a file name with another one, grouped by that name. Story examples
 * are left out: each belongs to the component whose stories show it.
 */
export function duplicateComponentNames(sourceRels: readonly string[]): Map<string, string[]> {
  const byName = new Map<string, string[]>()
  for (const sourceRel of sourceRels) {
    if (!sourceRel.startsWith('src/components/') || !sourceRel.endsWith('.vue')) continue
    if (sourceRel.split('/').includes('examples')) continue
    const name = path.basename(sourceRel)
    byName.set(name, [...(byName.get(name) ?? []), sourceRel])
  }
  return new Map([...byName].filter(([, files]) => files.length > 1))
}

export const uniqueComponentNames: Rule = {
  name: 'open-pencil/unique-component-names',
  check(root) {
    const files = collectFiles(root)
    const sourceRels = files.map((file) => relativePath(root.path, file))
    const diagnostics: Diagnostic[] = []
    for (const [name, duplicates] of duplicateComponentNames(sourceRels)) {
      for (const sourceRel of duplicates) {
        diagnostics.push({
          message: `${name} is also ${duplicates.filter((other) => other !== sourceRel).join(', ')}; give each component a unique name.`,
          location: { path: path.join(root.path, sourceRel) }
        })
      }
    }
    return { diagnostics }
  }
}
