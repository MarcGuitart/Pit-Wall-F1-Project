import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Mirrors tsconfig.json's "@/*" -> "./*" alias, so lib/ files that import
// with "@/..." (the project's convention throughout) resolve under vitest
// the same way they resolve under Next.js's own bundler.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
  },
})
