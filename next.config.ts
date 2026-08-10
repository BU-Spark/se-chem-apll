import fs from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * ESM-only packages (the unified / react-markdown / remark ecosystem) must be
 * listed in `transpilePackages` so that next/jest's SWC transformer processes
 * them in Jest. The list is computed from the installed dependency tree
 * instead of being hardcoded, so it stays correct across upgrades.
 */
function resolvePackageJson(name: string, fromDir: string): string | null {
  try {
    let dir = path.dirname(require.resolve(name, { paths: [fromDir] }));
    while (dir !== path.dirname(dir)) {
      const candidate = path.join(dir, 'package.json');
      if (fs.existsSync(candidate)) {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { name?: string };
        if (pkg.name === name) return candidate;
      }
      dir = path.dirname(dir);
    }
  } catch {
    // Unresolvable (types-only or optional) — skip.
  }
  return null;
}

function entryIsEsm(pkgPath: string): boolean {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
    type?: string;
    main?: string;
  };
  if (pkg.type === 'module') return true;
  // Some packages ship ESM syntax without declaring "type": "module"
  // (e.g. escape-string-regexp). Sniff the entry file.
  try {
    const entry = path.join(path.dirname(pkgPath), pkg.main ?? 'index.js');
    return /^(import|export)\s/m.test(fs.readFileSync(entry, 'utf8'));
  } catch {
    return false;
  }
}

function findEsmDependencyClosure(roots: string[]): string[] {
  const seen = new Set<string>();
  const esmOnly = new Set<string>();
  const queue: Array<{ name: string; fromDir: string }> = roots.map((name) => ({
    name,
    fromDir: process.cwd(),
  }));

  while (queue.length > 0) {
    const { name, fromDir } = queue.shift()!;
    const pkgPath = resolvePackageJson(name, fromDir);
    if (!pkgPath || seen.has(pkgPath)) continue;
    seen.add(pkgPath);

    if (entryIsEsm(pkgPath)) esmOnly.add(name);

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const depDir = path.dirname(pkgPath);
    for (const dep of Object.keys(pkg.dependencies ?? {})) queue.push({ name: dep, fromDir: depDir });
  }

  return [...esmOnly].sort();
}

const nextConfig: NextConfig = {
  transpilePackages: findEsmDependencyClosure(['react-markdown', 'remark-gfm', 'remark-math', 'rehype-katex']),
};

export default nextConfig;
