import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Mirrors tsconfig.json's "@/*" -> "./*" alias, so lib/ files that import
// with "@/..." (the project's convention throughout) resolve under vitest
// the same way they resolve under Next.js's own bundler. The React plugin is
// needed for .tsx test files (components/*.test.tsx) — without it, JSX in a
// test file fails to parse; plain .ts unit tests do not need it but are
// unaffected by having it.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // next/font is compiled by Next; tests get a stub (test/next-font-stub.ts)
      'next/font/google': path.resolve(__dirname, 'test/next-font-stub.ts'),
    },
  },
  test: {
    environment: 'node',
  },
})
