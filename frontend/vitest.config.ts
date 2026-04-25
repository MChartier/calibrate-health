import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      all: true,
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/utils/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/types/**',
      ],
      thresholds: {
        statements: 75,
        branches: 70,
        functions: 80,
        lines: 75,
      },
    },
  },
})
