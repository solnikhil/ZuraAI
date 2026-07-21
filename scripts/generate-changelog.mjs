#!/usr/bin/env bun
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

function parseArgs(argv) {
  const args = {
    fromTag: '',
    toRef: 'HEAD',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--from-tag' && next) {
      args.fromTag = next
      index += 1
    } else if (arg === '--to-ref' && next) {
      args.toRef = next
      index += 1
    }
  }

  return args
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function formatSubject(subject) {
  return subject.replace(/^[-*\s]+/, '').trim()
}

const { fromTag, toRef } = parseArgs(process.argv.slice(2))
const releaseVersion = (process.env.GITHUB_REF_NAME || toRef).replace(/^v/, '')

function readCuratedRelease(version) {
  let changelog

  try {
    changelog = readFileSync('CHANGELOG.md', 'utf8')
  } catch {
    return ''
  }

  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const section = changelog.match(
    new RegExp(
      `^## \\[${escapedVersion}\\](?:\\s+-[^\\n]*)?\\r?\\n([\\s\\S]*?)(?=^## \\[|^\\[[^\\]]+\\]:|(?![\\s\\S]))`,
      'm',
    ),
  )

  return section?.[1]?.trim() || ''
}

const curatedRelease = readCuratedRelease(releaseVersion)
const version = process.env.GITHUB_REF_NAME || toRef

console.log(`## ZuraAI ${version}`)
console.log('')

if (curatedRelease) {
  console.log(curatedRelease)
  process.exit(0)
}

const range = fromTag ? `${fromTag}..${toRef}` : toRef
const commits = git(['log', '--pretty=format:%s', range])
  .split('\n')
  .map(formatSubject)
  .filter(Boolean)
  .filter((subject) => !/^merge\b/i.test(subject))

if (commits.length === 0) {
  console.log('- Maintenance release.')
} else {
  for (const subject of commits) {
    console.log(`- ${subject}`)
  }
}
