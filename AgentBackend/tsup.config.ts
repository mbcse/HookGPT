import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src',
    '!src/**/__tests__/**',
    '!src/**/*.test.*',
    // Exclude problematic file types
    '!src/**/*.md',
    '!src/**/*.sql',
    '!src/**/*.toml',
    '!src/**/*.prisma',
    '!src/**/migrations/**',
  ],
  splitting: false,
  sourcemap: true,
  clean: true,
  esbuildOptions: (options) => {
    options.external = [
      '*.md',
      '*.sql',
      '*.toml',
      '*.prisma',
      'src/database/prisma/*'
    ];
  }
}); 