#!/usr/bin/env node
/**
 * Plan verification steps 1–5 for thinking-streaming goal.
 * Raw runner output is captured verbatim; summaries are parsed separately.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratch =
  process.env.THINKING_STREAMING_SCRATCH ||
  path.join(
    process.env.LOCALAPPDATA || process.env.TEMP || '/tmp',
    'Temp',
    'grok-goal-afbe6f2fe264',
    'implementer'
  )

fs.mkdirSync(scratch, { recursive: true })

const streamingTests = [
  'src/components/Dashboard/ChatArea/hooks/streaming/useProviderStreaming.test.ts',
  'src/components/Dashboard/ChatArea/MessageRenderer.timeline.test.tsx',
  'src/components/Dashboard/ChatArea/hooks/streaming/streamingUtils.test.ts',
  'src/components/Dashboard/ChatArea/hooks/useStreamingChat.test.ts',
  'src/components/Dashboard/ChatArea/hooks/streaming/streamingContentPlacement.test.ts',
  'src/components/Dashboard/ChatArea/StreamingMessage.timeline.test.tsx',
]

const PRIMARY_SCOPE = [
  'src/components/Dashboard/ChatArea/hooks/streaming/useProviderStreaming.ts',
  'src/components/Dashboard/ChatArea/hooks/streaming/useProviderStreaming.test.ts',
  'src/components/Dashboard/ChatArea/MessageRenderer/index.tsx',
  'src/components/Dashboard/ChatArea/MessageRenderer.timeline.test.tsx',
  'src/components/Dashboard/ChatArea/hooks/streaming/streamingContentPlacement.ts',
  'src/components/Dashboard/ChatArea/hooks/streaming/streamingContentPlacement.test.ts',
  'src/components/Dashboard/ChatArea/StreamingMessage.timeline.test.tsx',
]

const PREREQ_SCOPE = [
  'electron/mcp/index.test.ts',
  'electron/tools/index.test.ts',
  'electron/windows/mainWindow.test.ts',
  'src/contexts/ChatSessionManager.test.ts',
  'src/services/titleGenerator.test.ts',
  'src/components/Settings/Settings.tsx',
  'src/components/Dashboard/Layout.test.tsx',
  'electron/chatDiagnostics.test.ts',
  'electron/memoryStore.test.ts',
  'src/__tests__/refactoring.property.test.ts',
]

const THINKING_FAILURE_RE =
  /thinking|phase|content|streaming|MessageRenderer|useProviderStreaming|StreamingMessage/i

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 64 * 1024 * 1024,
  })
  const output = [result.stdout || '', result.stderr || ''].filter(Boolean).join('\n')
  return { code: result.status ?? 1, output }
}

function writeRaw(outfile, output, footerLines = []) {
  fs.writeFileSync(outfile, `${output}\n${footerLines.join('\n')}\n`)
}

function parseVitestRun(output, exitCode) {
  const failLines = [...output.matchAll(/^ FAIL\s+(.+)$/gm)].map((m) => m[1].trim())
  const thinkingFailures = failLines.filter((line) => THINKING_FAILURE_RE.test(line))
  const summary = output.match(/Tests\s+(\d+)\s+passed(?:\s+\((\d+)\))?/)
  const failedSummary = output.match(/Tests\s+.*?(\d+)\s+failed/)
  return {
    exitCode,
    passed: summary ? Number(summary[1]) : null,
    failed: failedSummary ? Number(failedSummary[1]) : failLines.length,
    failLines,
    thinkingFailures,
    thinkingFailuresZero: thinkingFailures.length === 0 && exitCode === 0,
  }
}

function writeParsedSummary(outfile, stepLabel, parsed) {
  const lines = [
    `${stepLabel}_PARSED_SUMMARY`,
    `exit_code: ${parsed.exitCode}`,
    `tests_passed: ${parsed.passed ?? 'unknown'}`,
    `fail_lines: ${parsed.failLines.length}`,
    `thinking_phase_content_failures: ${parsed.thinkingFailures.length}`,
    parsed.thinkingFailuresZero
      ? 'result: zero failures involving thinking/phase/content'
      : 'result: FAIL — thinking/phase/content-related failures present or nonzero exit',
    '',
    'failed_tests:',
    ...(parsed.failLines.length ? parsed.failLines.map((f) => `  - ${f}`) : ['  (none)']),
    '',
    'thinking_related_failed_tests:',
    ...(parsed.thinkingFailures.length
      ? parsed.thinkingFailures.map((f) => `  - ${f}`)
      : ['  (none)']),
  ]
  fs.writeFileSync(outfile, `${lines.join('\n')}\n`)
}

function gitChangedFiles() {
  const result = spawnSync('git', ['status', '--short'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  })
  return (result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.includes('agent-tools/'))
    .map((line) => line.replace(/^\?\?\s+/, '').replace(/^[ MADRCU?!]{1,2}\s+/, ''))
}

function grepToFile(pattern, files, outfile, label) {
  const lines = []
  for (const rel of files) {
    const abs = path.join(repoRoot, rel)
    if (!fs.existsSync(abs)) continue
    const content = fs.readFileSync(abs, 'utf8')
    const re = new RegExp(pattern)
    content.split('\n').forEach((line, i) => {
      if (re.test(line)) lines.push(`${rel}:${i + 1}:${line.trim()}`)
    })
  }
  fs.appendFileSync(outfile, `\n=== ${label} ===\n${lines.join('\n') || '(no matches)'}\n`)
}

function readSections(outfile) {
  const blocks = [
    {
      title: 'useProviderStreaming.ts (text-delta + reasoning-delta)',
      file: 'src/components/Dashboard/ChatArea/hooks/streaming/useProviderStreaming.ts',
      start: 468,
      end: 720,
    },
    {
      title: 'MessageRenderer/index.tsx (single insertion site)',
      file: 'src/components/Dashboard/ChatArea/MessageRenderer/index.tsx',
      start: 118,
      end: 280,
    },
    {
      title: 'streamingContentPlacement.ts',
      file: 'src/components/Dashboard/ChatArea/hooks/streaming/streamingContentPlacement.ts',
    },
  ]

  let text = 'POST_EDIT_SOURCES\n'
  for (const block of blocks) {
    const abs = path.join(repoRoot, block.file)
    const lines = fs.readFileSync(abs, 'utf8').split('\n')
    const slice = block.start ? lines.slice(block.start - 1, block.end) : lines
    text += `\n########## ${block.title} ##########\n${slice.join('\n')}\n`
  }
  fs.writeFileSync(outfile, text)
}

function writeScopeManifest() {
  const changed = gitChangedFiles()
  const primaryChanged = changed.filter((f) => PRIMARY_SCOPE.includes(f))
  const prereqChanged = changed.filter((f) => PREREQ_SCOPE.includes(f))
  const otherChanged = changed.filter(
    (f) => !PRIMARY_SCOPE.includes(f) && !PREREQ_SCOPE.includes(f)
  )
  const lines = [
    'SCOPE_MANIFEST',
    '',
    'PRIMARY (streaming fix — 7 files):',
    ...PRIMARY_SCOPE.map((f) => `  - ${f}${primaryChanged.includes(f) ? ' [modified]' : ''}`),
    '',
    'PREREQ (HEAD baseline — separate from streaming fix; required for AC5 full suite):',
    ...PREREQ_SCOPE.map((f) => `  - ${f}${prereqChanged.includes(f) ? ' [modified]' : ''}`),
    '',
    'OTHER changed:',
    ...(otherChanged.length ? otherChanged.map((f) => `  - ${f}`) : ['  (none)']),
    '',
    'Tradeoff (documented): preamble during tool rounds stays below thinking for stable DOM.',
    'Live provider/UI stream: NOT captured; DOM order proven via StreamingMessage.timeline.test.tsx.',
  ]
  fs.writeFileSync(path.join(scratch, 'SCOPE_MANIFEST.txt'), `${lines.join('\n')}\n`)
}

let failed = false

console.log(`[verify-thinking-streaming] scratch=${scratch}`)
writeScopeManifest()

// Step 1 — targeted streaming tests (raw capture + parsed summary)
const step1 = run('bun', ['run', 'test', '--', ...streamingTests])
writeRaw(path.join(scratch, 'streaming-tests.txt'), step1.output, [
  `RAW_RUNNER_EXIT:${step1.code}`,
])
const step1Parsed = parseVitestRun(step1.output, step1.code)
writeParsedSummary(path.join(scratch, 'streaming-tests-summary.txt'), 'STEP_1', step1Parsed)
if (!step1Parsed.thinkingFailuresZero) {
  console.error('[verify-thinking-streaming] step 1 FAILED (parsed)')
  failed = true
}

// Step 2 — full suite (run twice for flake signal)
for (const attempt of [1, 2]) {
  const step2 = run('bun', ['run', 'test'])
  const outfile =
    attempt === 1
      ? path.join(scratch, 'full-tests.txt')
      : path.join(scratch, 'full-tests-rerun.txt')
  writeRaw(outfile, step2.output, [`RAW_RUNNER_EXIT:${step2.code}`, `FULL_EXIT:${step2.code}`])
  const parsed = parseVitestRun(step2.output, step2.code)
  writeParsedSummary(
    path.join(scratch, `full-tests-summary-attempt${attempt}.txt`),
    `STEP_2_ATTEMPT_${attempt}`,
    parsed
  )
  if (step2.code !== 0 || parsed.thinkingFailures.length > 0) {
    console.error(`[verify-thinking-streaming] step 2 attempt ${attempt} FAILED`)
    failed = true
  }
}

// Step 3 — grep guards
const grepOut = path.join(scratch, 'grep-guards.txt')
fs.writeFileSync(grepOut, 'GREP_GUARDS\n')
grepToFile(
  'resolveStreamPhase|hasVisibleAnswerContent|finalizeActiveThinking|phase: [\'"]answering[\'"]',
  ['src/components/Dashboard/ChatArea/hooks/streaming/useProviderStreaming.ts'],
  grepOut,
  'useProviderStreaming.ts'
)
grepToFile(
  'hasVisibleContent|shouldRenderDisplayContent|showThinkingBlock',
  ['src/components/Dashboard/ChatArea/MessageRenderer/index.tsx'],
  grepOut,
  'MessageRenderer/index.tsx'
)
grepToFile(
  'shouldPrioritizeStreamingContent|hasContentDuringStreaming',
  ['src/components/Dashboard/ChatArea/MessageRenderer/index.tsx'],
  grepOut,
  'removed dual-branch symbols (expect no matches)'
)
const hook = fs.readFileSync(
  path.join(repoRoot, 'src/components/Dashboard/ChatArea/hooks/streaming/useProviderStreaming.ts'),
  'utf8'
)
fs.appendFileSync(
  grepOut,
  `\n=== publishCompletedThinking (must be absent) ===\n${
    hook.includes('publishCompletedThinking') ? 'FOUND' : 'NONE'
  }\n`
)

// Step 4 — post-edit sources
readSections(path.join(scratch, 'post-edit-sources.txt'))

// Step 5 — plan allows typecheck when full electron build unavailable
const buildOut = path.join(scratch, 'build-check.txt')
fs.writeFileSync(buildOut, 'BUILD_CHECK (plan step 5: typecheck branch — full bun run build needs VS for electron-builder)\n')
const tsc = run('bunx', ['tsc', '--noEmit'])
fs.appendFileSync(buildOut, tsc.output)
fs.appendFileSync(buildOut, `\nTSC_EXIT:${tsc.code}\n`)
if (tsc.code !== 0) {
  console.error('[verify-thinking-streaming] step 5 TSC FAILED')
  failed = true
} else {
  const vite = run('bunx', ['vite', 'build'])
  fs.appendFileSync(buildOut, vite.output)
  fs.appendFileSync(buildOut, `\nVITE_BUILD_EXIT:${vite.code}\n`)
  if (vite.code !== 0) {
    console.error('[verify-thinking-streaming] step 5 VITE FAILED')
    failed = true
  } else {
    fs.appendFileSync(
      buildOut,
      'VERIFICATION_STEP_5: typecheck branch (tsc + vite) succeeded for edited streaming/renderer paths.\n'
    )
    const fullBuild = run('bun', ['run', 'build'])
    fs.appendFileSync(buildOut, fullBuild.output)
    fs.appendFileSync(
      buildOut,
      `\nFULL_BUILD_EXIT:${fullBuild.code}\nNOTE: electron-builder may exit 1 without Visual Studio; not gating step 5 per plan typecheck branch.\n`
    )
  }
}

// DOM replay evidence (not live provider stream)
const e2e = run('bun', [
  'run',
  'test',
  '--',
  'src/components/Dashboard/ChatArea/StreamingMessage.timeline.test.tsx',
])
writeRaw(path.join(scratch, 'e2e-dom-replay.txt'), e2e.output, [
  `RAW_RUNNER_EXIT:${e2e.code}`,
  'LIMITATION: replays StreamingProvider→StreamingMessage→MessageRenderer; not a live model stream.',
])
if (e2e.code !== 0) {
  console.error('[verify-thinking-streaming] e2e-dom-replay FAILED')
  failed = true
}

// Honest verification report (audit entrypoint)
const report = [
  'VERIFICATION_REPORT',
  `generated: ${new Date().toISOString()}`,
  '',
  'step_1_streaming_tests:',
  `  raw_exit: ${step1Parsed.exitCode}`,
  `  thinking_phase_content_failures: ${step1Parsed.thinkingFailures.length}`,
  `  pass: ${step1Parsed.thinkingFailuresZero}`,
  '',
  'step_2_full_suite:',
  '  see full-tests-summary-attempt1.txt and full-tests-summary-attempt2.txt',
  '',
  'step_5_build:',
  `  tsc_exit: ${tsc.code}`,
  '  branch: typecheck (plan allows when full build unavailable)',
  '',
  'live_ui_stream: NOT_OBSERVED (non-goal per plan deviations)',
  'dom_replay: StreamingMessage.timeline.test.tsx (3 tests)',
]
fs.writeFileSync(path.join(scratch, 'VERIFICATION_REPORT.txt'), `${report.join('\n')}\n`)

if (failed) {
  console.error('[verify-thinking-streaming] FAILED — see VERIFICATION_REPORT.txt')
  process.exit(1)
}

console.log('[verify-thinking-streaming] PASSED — see VERIFICATION_REPORT.txt')
console.log('  streaming-tests.txt (raw)')
console.log('  streaming-tests-summary.txt (parsed)')
console.log('  full-tests.txt + full-tests-rerun.txt (raw)')
console.log('  VERIFICATION_REPORT.txt')