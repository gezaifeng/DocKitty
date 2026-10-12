import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@renderer': path.resolve('src/renderer/src') },
  },
  test: {
    include: [
      'src/renderer/src/**/*.test.tsx',
      'src/renderer/src/**/*.test.ts',
    ],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/renderer/src/test/setup.ts'],
    testTimeout: 10000,
    passWithNoTests: true,
  },
})
