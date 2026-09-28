import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@wordgit/core', '@wordgit/shared'] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@wordgit/shared'] })],
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: { input: 'src/renderer/index.html' },
    },
    resolve: {
      alias: { '@renderer': path.resolve('src/renderer/src') },
    },
    plugins: [react(), tailwindcss()],
  },
})
