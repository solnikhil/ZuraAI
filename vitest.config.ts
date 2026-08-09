import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@zura/provider-core': path.resolve(__dirname, './packages/provider-core/src/index.ts'),
      'lucide-react': path.resolve(__dirname, './src/lib/lucide-react.tsx'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Every committed Vitest file must be matched here. `scripts/**` and the
    // `.cjs` Node-test suite were previously omitted, so two committed suites
    // never ran in CI. The `.cjs` suite runs under `node --test` via the root
    // `test:node` script; `src/test/testRunnerCoverage.test.ts` asserts that
    // between the two runners no committed test file is skipped.
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'electron/**/*.test.ts',
      'packages/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
  },
})
