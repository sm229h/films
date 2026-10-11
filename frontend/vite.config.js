import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const isPreview = process.env.BASE44_PREVIEW_MODE === '1';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Allow the sandbox hostname (the platform also injects
    // __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS, which Vite merges in).
    allowedHosts: isPreview
      ? [`.${process.env.BASE44_SANDBOX_HOST_DOMAIN || 'e2b.app'}`]
      : [],
    // Behind the HTTPS preview proxy the HMR socket must be wss on 443,
    // otherwise the client would try to reach the container port directly.
    hmr: isPreview ? { protocol: 'wss', clientPort: 443 } : true,
    proxy: {
      // Single-origin wiring: the browser only ever talks to the web server,
      // so session cookies stay same-origin and CORS is unnecessary.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Keep the initial bundle small for the home page (Core Web Vitals).
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          player: ['hls.js'],
        },
      },
    },
  },
});
