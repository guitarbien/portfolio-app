/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/main.tsx', 'src/**/*.test.*', 'src/test-setup.ts'],
      thresholds: { lines: 85, functions: 85, branches: 85, statements: 85 },
    },
  },
})
