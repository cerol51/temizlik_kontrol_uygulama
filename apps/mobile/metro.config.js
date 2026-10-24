const { getDefaultConfig } = require('expo/metro-config');
const http = require('http');

const config = getDefaultConfig(__dirname);

// Proxy /api requests to NestJS backend on port 3000
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      if (req.url && req.url.startsWith('/api')) {
        const options = {
          hostname: '127.0.0.1',
          port: 3000,
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            host: '127.0.0.1:3000',
          },
        };
        const proxy = http.request(options, (targetRes) => {
          res.writeHead(targetRes.statusCode, targetRes.headers);
          targetRes.pipe(res, { end: true });
        });
        proxy.on('error', (err) => {
          console.error('Metro API Proxy Error:', err.message);
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Backend unreachable', details: err.message }));
        });
        req.pipe(proxy, { end: true });
        return;
      }
      return middleware(req, res, next);
    };
  },
};

module.exports = config;
