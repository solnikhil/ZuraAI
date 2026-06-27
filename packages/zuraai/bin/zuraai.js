#!/usr/bin/env node
'use strict';

const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');

const packageJson = require('../package.json');

const OWNER = process.env.ZURAAI_RELEASE_OWNER || 'solnikhil';
const REPO = process.env.ZURAAI_RELEASE_REPO || 'ZuraAI';
const API_BASE = process.env.ZURAAI_GITHUB_API || 'https://api.github.com';
const DEFAULT_TAG = process.env.ZURAAI_RELEASE_TAG || `v${packageJson.version}`;
const RELEASE_DOWNLOAD_BASE =
  process.env.ZURAAI_RELEASE_DOWNLOAD_BASE || `https://github.com/${OWNER}/${REPO}/releases/download`;

const helpText = `
ZuraAI desktop launcher

Usage:
  zuraai [run] [--latest | --tag <tag>] [--force] [--no-verify]
  zuraai install [--latest | --tag <tag>] [--force] [--no-verify]
  zuraai update [--latest | --tag <tag>] [--no-verify]
  zuraai installer [--latest | --tag <tag>] [--force] [--no-verify]
  zuraai cache-dir
  zuraai uninstall
  zuraai --version

Environment:
  ZURAAI_CACHE_DIR              Override app download cache.
  ZURAAI_RELEASE_TAG            Pin a release tag, e.g. v0.0.6.
  ZURAAI_RELEASE_OWNER          GitHub owner override.
  ZURAAI_RELEASE_REPO           GitHub repo override.
  ZURAAI_RELEASE_DOWNLOAD_BASE  Release asset download base override.
`.trim();

function fail(message) {
  console.error(`zuraai: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    command: 'run',
    tag: DEFAULT_TAG,
    latest: false,
    force: false,
    verify: true,
  };

  if (args[0] && !args[0].startsWith('-')) {
    options.command = args.shift();
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--latest') {
      options.latest = true;
    } else if (arg === '--tag') {
      const tag = args[index + 1];
      if (!tag || tag.startsWith('-')) {
        fail('--tag requires a release tag value.');
      }
      options.tag = tag;
      index += 1;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--no-verify') {
      options.verify = false;
    } else if (arg === '--help' || arg === '-h') {
      options.command = 'help';
    } else if (arg === '--version' || arg === '-v') {
      options.command = 'version';
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }

  if (options.latest && options.tag !== DEFAULT_TAG) {
    fail('use either --latest or --tag, not both.');
  }

  return options;
}

function cacheRoot() {
  if (process.env.ZURAAI_CACHE_DIR) {
    return path.resolve(process.env.ZURAAI_CACHE_DIR);
  }
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'zuraai-cli');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches', 'zuraai-cli');
  }
  return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'zuraai-cli');
}

function assertSupportedPlatform() {
  if (process.platform !== 'win32') {
    fail('package-manager launching currently supports Windows releases only.');
  }
  if (process.arch !== 'x64') {
    fail(`no ZuraAI package-manager artifact is configured for ${process.platform}-${process.arch}.`);
  }
}

function versionFromTag(tag) {
  return tag.replace(/^v/, '');
}

function portableAssetName(tag) {
  return `ZuraAI-Portable-${versionFromTag(tag)}-x64.exe`;
}

function installerAssetName(tag) {
  return `ZuraAI-Setup-${versionFromTag(tag)}.exe`;
}

function request(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `zuraai-launcher/${packageJson.version}`,
        },
      },
      (res) => {
        const location = res.headers.location;
        if (location && res.statusCode >= 300 && res.statusCode < 400) {
          if (redirects > 8) {
            reject(new Error(`too many redirects while fetching ${url}`));
            return;
          }
          resolve(request(new URL(location, url).toString(), redirects + 1));
          return;
        }
        resolve(res);
      },
    );
    req.on('error', reject);
  });
}

async function readText(url) {
  const res = await request(url);
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`HTTP ${res.statusCode} while fetching ${url}`);
  }
  const chunks = [];
  for await (const chunk of res) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(url) {
  return JSON.parse(await readText(url));
}

async function downloadFile(url, destination) {
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const tempPath = `${destination}.download`;
  const res = await request(url);
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`HTTP ${res.statusCode} while downloading ${url}`);
  }
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tempPath);
    res.pipe(file);
    res.on('error', reject);
    file.on('error', reject);
    file.on('finish', () => file.close(resolve));
  });
  await fsp.rename(tempPath, destination);
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

async function resolveTag(options) {
  if (!options.latest) {
    return options.tag;
  }
  const release = await readJson(`${API_BASE}/repos/${OWNER}/${REPO}/releases/latest`);
  if (!release.tag_name) {
    throw new Error('latest release response did not include tag_name.');
  }
  return release.tag_name;
}

async function verifyChecksum(tag, assetName, filePath, enabled) {
  if (!enabled) {
    console.warn('zuraai: checksum verification disabled by --no-verify.');
    return;
  }

  const checksumUrl = `${RELEASE_DOWNLOAD_BASE}/${encodeURIComponent(tag)}/checksums.txt`;
  const checksumText = await readText(checksumUrl);
  const expected = checksumText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
      return match ? { digest: match[1].toLowerCase(), name: match[2] } : null;
    })
    .filter(Boolean)
    .find((entry) => entry.name === assetName);

  if (!expected) {
    throw new Error(`checksums.txt does not include ${assetName}.`);
  }

  const actual = await sha256(filePath);
  if (actual !== expected.digest) {
    throw new Error(`checksum mismatch for ${assetName}.`);
  }
}

async function ensureArtifact(options, kind) {
  assertSupportedPlatform();
  const tag = await resolveTag(options);
  const assetName = kind === 'installer' ? installerAssetName(tag) : portableAssetName(tag);
  const destination = path.join(cacheRoot(), 'apps', tag, assetName);
  const exists = fs.existsSync(destination);

  if (!exists || options.force || options.command === 'update') {
    const url = `${RELEASE_DOWNLOAD_BASE}/${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`;
    console.log(`zuraai: downloading ${assetName}`);
    await downloadFile(url, destination);
    await verifyChecksum(tag, assetName, destination, options.verify);
  }

  return { destination, tag, assetName };
}

function launchExecutable(filePath) {
  const child = spawn(filePath, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.command === 'help') {
    console.log(helpText);
    return;
  }
  if (options.command === 'version') {
    console.log(packageJson.version);
    return;
  }
  if (options.command === 'cache-dir') {
    console.log(cacheRoot());
    return;
  }
  if (options.command === 'uninstall') {
    await fsp.rm(cacheRoot(), { recursive: true, force: true });
    console.log(`zuraai: removed ${cacheRoot()}`);
    return;
  }

  if (options.command === 'installer') {
    const artifact = await ensureArtifact(options, 'installer');
    console.log(`zuraai: launching installer ${artifact.assetName}`);
    launchExecutable(artifact.destination);
    return;
  }

  if (!['run', 'install', 'update'].includes(options.command)) {
    fail(`unknown command: ${options.command}`);
  }

  const artifact = await ensureArtifact(options, 'portable');
  if (options.command === 'install' || options.command === 'update') {
    console.log(`zuraai: ready at ${artifact.destination}`);
    return;
  }
  if (options.command === 'run') {
    launchExecutable(artifact.destination);
  }
}

main().catch((error) => fail(error.message));
