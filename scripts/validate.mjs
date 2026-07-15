import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const failures = [];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === '.git' || name === 'node_modules') return [];
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(root);
const jsFiles = files.filter((file) => extname(file) === '.js' || extname(file) === '.mjs');
const htmlFiles = files.filter((file) => extname(file) === '.html');
const versionsByAsset = new Map();

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${relative(root, file)}: ${result.stderr.trim() || 'JavaScript syntax check failed'}`);
}

for (const file of htmlFiles) {
  const source = readFileSync(file, 'utf8');
  const label = relative(root, file);
  const ids = [...source.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  for (const id of new Set(duplicateIds)) failures.push(`${label}: duplicate id "${id}"`);

  if (!/<html\s+lang=["'][^"']+["']/i.test(source)) failures.push(`${label}: missing html lang attribute`);
  if (!/name=["']viewport["']/i.test(source)) failures.push(`${label}: missing viewport metadata`);
  if (/maximum-scale|user-scalable\s*=\s*no/i.test(source)) failures.push(`${label}: browser zoom is restricted`);

  for (const match of source.matchAll(/\b(?:src|href)=["']([^"'#]+)["']/g)) {
    const ref = match[1];
    if (/^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(ref)) continue;
    const [assetPath, query = ''] = ref.split('?');
    if (!assetPath) continue;
    const target = resolve(join(file, '..'), assetPath);
    if (!existsSync(target)) failures.push(`${label}: missing local asset "${assetPath}"`);
    const version = new URLSearchParams(query).get('v');
    if (version) {
      if (!versionsByAsset.has(assetPath)) versionsByAsset.set(assetPath, new Set());
      versionsByAsset.get(assetPath).add(version);
    }
  }
}

for (const [asset, versions] of versionsByAsset) {
  if (versions.size > 1) failures.push(`${asset}: inconsistent cache versions (${[...versions].join(', ')})`);
}

for (const file of files.filter((path) => /\.(?:html|js)$/i.test(path))) {
  const source = readFileSync(file, 'utf8');
  if (/(^|[^\w.])confirm\s*\(/m.test(source)) failures.push(`${relative(root, file)}: native confirm() found; use FamilyPalUI.confirm()`);
}

if (failures.length) {
  console.error(`FamilyPal validation failed (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`FamilyPal validation passed: ${jsFiles.length} scripts and ${htmlFiles.length} pages checked.`);
