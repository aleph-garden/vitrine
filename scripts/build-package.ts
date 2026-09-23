// Builds a publishable package: TypeScript to JavaScript and declarations,
// plus the manifest the registry gets. One script for every library package,
// so the emit options live in one place.
//
// The output directory is the tarball root. `npm pack` and `npm publish` run
// inside packages/<name>/dist, never in the package directory, because the
// package directory's `exports` point at `src/*.ts` and have to keep doing so:
// pod-host, www and the test suite resolve these packages through
// the bun workspace and read the source. npm ignores `publishConfig.exports`,
// so the swap to built output happens here instead. See PUBLISHING.md.

import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const PACKAGES = join(ROOT, 'packages')

type Manifest = {
  name: string
  version: string
  private?: boolean
  type?: string
  exports?: Record<string, string>
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [key: string]: unknown
}

const read = (path: string): Manifest => JSON.parse(readFileSync(path, 'utf8'))

/** The workspace packages that go to the registry: every one not marked
 *  private. A package that must never be published carries `"private": true`
 *  and is skipped here and refused by npm. */
function publishable(): string[] {
  return readdirSync(PACKAGES).filter((name) => {
    try {
      return read(join(PACKAGES, name, 'package.json')).private !== true
    } catch {
      return false
    }
  })
}

/** Compiles src to JavaScript and declarations. The type options come from the
 *  repository's tsconfig.json so the build and `bun run typecheck` cannot
 *  disagree; only the emit options are set here. */
function compile(dir: string, out: string): void {
  const config = join(mkdtempSync(join(tmpdir(), 'aleph-build-')), 'tsconfig.json')
  writeFileSync(
    config,
    JSON.stringify({
      extends: join(ROOT, 'tsconfig.json'),
      compilerOptions: {
        noEmit: false,
        declaration: true,
        declarationMap: false,
        sourceMap: false,
        rewriteRelativeImportExtensions: true,
        // The repository's tsconfig pulls in bun's globals for the tests. A
        // published declaration file may not depend on them.
        types: [],
        rootDir: join(dir, 'src'),
        outDir: out
      },
      include: [join(dir, 'src', '**', '*.ts')],
      exclude: []
    })
  )
  const tsc = join(ROOT, 'node_modules', '.bin', 'tsc')
  const result = spawnSync(tsc, ['-p', config], { stdio: 'inherit', shell: false })
  rmSync(config, { force: true })
  if (result.status !== 0) throw new Error(`tsc failed for ${dir}`)
}

/** tsc 7.0.2 applies `rewriteRelativeImportExtensions` to the JavaScript it
 *  emits and not to the declarations, which leaves `from './index.ts'` in
 *  every .d.ts and no such file beside it. Drop this once tsc rewrites both. */
function fixDeclarationExtensions(out: string): number {
  let fixed = 0
  for (const entry of readdirSync(out, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.d.ts')) continue
    const path = join(entry.parentPath, entry.name)
    const text = readFileSync(path, 'utf8')
    const patched = text.replace(/(from\s+'\.{1,2}\/[^']*)\.ts'/g, "$1.js'")
    if (patched !== text) {
      writeFileSync(path, patched)
      fixed += 1
    }
  }
  return fixed
}

/** Everything under src that tsc does not compile: the stylesheet and the font
 *  host-core exports, which keep their relative positions in the output. */
function copyAssets(dir: string, out: string): void {
  cpSync(join(dir, 'src'), out, {
    recursive: true,
    filter: (src) => !src.endsWith('.ts')
  })
}

/** The manifest the registry gets. `exports` move from src to the built files
 *  beside it, workspace dependencies get the version they are published under,
 *  and the fields that only mean something inside this repository go. */
function publishManifest(source: Manifest, version: string): Record<string, unknown> {
  const target = (value: string) => value.replace(/^\.\/src\//, './')
  const exports: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source.exports ?? {})) {
    if (!value.endsWith('.ts')) {
      exports[key] = target(value)
      continue
    }
    const js = target(value).replace(/\.ts$/, '.js')
    exports[key] = { types: js.replace(/\.js$/, '.d.ts'), default: js }
  }

  const dependencies = Object.fromEntries(
    Object.entries(source.dependencies ?? {}).map(([name, range]) => [
      name,
      range.startsWith('workspace:') ? version : range
    ])
  )

  const { scripts, devDependencies, files, ...rest } = source
  const main = (exports['.'] as { default?: string } | undefined)?.default
  return {
    ...rest,
    ...(main ? { main, types: main.replace(/\.js$/, '.d.ts') } : {}),
    exports,
    ...(Object.keys(dependencies).length > 0 ? { dependencies } : {})
  }
}

function build(name: string): string {
  const dir = join(PACKAGES, name)
  const manifest = read(join(dir, 'package.json'))
  if (manifest.private === true) throw new Error(`${name} is private and cannot be published`)

  const out = join(dir, 'dist')
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })

  compile(dir, out)
  const fixed = fixDeclarationExtensions(out)
  copyAssets(dir, out)

  writeFileSync(
    join(out, 'package.json'),
    `${JSON.stringify(publishManifest(manifest, manifest.version), null, 2)}\n`
  )
  cpSync(join(ROOT, 'LICENSE'), join(out, 'LICENSE'))
  cpSync(join(dir, 'README.md'), join(out, 'README.md'))

  console.log(
    `${manifest.name}@${manifest.version} -> ${relative(ROOT, out)} (${fixed} declarations rewritten)`
  )
  return out
}

const names = process.argv.slice(2)
for (const name of names.length > 0 ? names : publishable()) build(name)
