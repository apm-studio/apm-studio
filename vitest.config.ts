import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'shared/**/*.test.ts'],
    },
    resolve: {
        alias: {
            '@': '/src',
        },
    },
})
