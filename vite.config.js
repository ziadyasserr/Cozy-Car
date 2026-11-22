import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      // Proxy iTrack web calls to avoid CORS issues and forward session cookies
      '/itrack-proxy': {
        target: 'https://www.itrack.top',
        changeOrigin: true,
        secure: false, // Avoid TLS rejection on target certificates
        rewrite: (path) => path.replace(/^\/itrack-proxy/, '') || '/',
        headers: {
          Referer: 'https://www.itrack.top/V2/index.jsp',
          Origin: 'https://www.itrack.top',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, req, res) => {
            const sc = proxyRes.headers['set-cookie'];
            if (sc) {
              const cookies = Array.isArray(sc) ? sc : [sc];
              // Strip Domain and Secure so the browser accepts and persists cookie for localhost
              const cleanCookies = cookies.map((c) =>
                c
                  .replace(/Domain=[^;]+;?\s*/gi, '')
                  .replace(/Secure;?\s*/gi, '')
                  .replace(/SameSite=[^;]+;?\s*/gi, 'SameSite=Lax; ')
              );
              proxyRes.headers['set-cookie'] = cleanCookies;

              // Extract token and expose it in a custom header so browser fetch can read it
              const tokenMatch = cookies.join(';').match(/token=([^;]+)/);
              if (tokenMatch) {
                proxyRes.headers['x-itrack-token'] = tokenMatch[1];
                proxyRes.headers['access-control-expose-headers'] = 'x-itrack-token';
              }
            }
          });

          proxy.on('error', (err, req, res) => {
            console.error('[iTrack Proxy Error]:', err.message);
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ errorcode: 502, errormsg: 'Gateway Error: ' + err.message }));
            }
          });
        },
      },
    },
  },
})
