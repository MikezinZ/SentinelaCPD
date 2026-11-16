import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      tailwindcss(),
      {
        name: 'sites-spa-fallback',
        apply: 'build',
        async writeBundle(options) {
          const output = options.dir ?? 'dist';
          await copyFile(resolve(output, 'index.html'), resolve(output, '404.html'));
        },
      },
    ],
    // Em desenvolvimento, /api/... é repassado para a API do Cloud (Docker na porta 8000).
    server: {
      proxy: {
        '/api': { target: env.VITE_PROXY_TARGET || 'http://localhost:8000', changeOrigin: true },
      },
    },
  };
});
