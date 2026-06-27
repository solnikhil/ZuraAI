import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(repoRoot, 'release');
const outputFile = path.join(releaseDir, 'checksums.txt');
const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
const currentVersion = packageJson.version;

const ignoredExtensions = new Set(['.blockmap', '.yml', '.yaml']);
const ignoredNames = new Set(['checksums.txt']);

async function sha256(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

if (!existsSync(releaseDir)) {
  console.warn(`Release directory does not exist: ${releaseDir}`);
  process.exit(0);
}

const entries = await readdir(releaseDir, { withFileTypes: true });
const artifactNames = entries
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => !ignoredNames.has(name))
  .filter((name) => !ignoredExtensions.has(path.extname(name).toLowerCase()))
  .filter((name) => name.startsWith('ZuraAI-'))
  .filter((name) => name.includes(`-${currentVersion}`))
  .sort((a, b) => a.localeCompare(b));

if (artifactNames.length === 0) {
  console.warn(`No release artifacts found in ${releaseDir}`);
  process.exit(0);
}

const lines = [];
for (const artifactName of artifactNames) {
  const digest = await sha256(path.join(releaseDir, artifactName));
  lines.push(`${digest}  ${artifactName}`);
}

await writeFile(outputFile, `${lines.join('\n')}\n`, 'utf8');
console.log(`Wrote ${path.relative(repoRoot, outputFile)} for ${artifactNames.length} artifact(s).`);
