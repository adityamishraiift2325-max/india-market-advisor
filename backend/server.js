import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import marketRoutes from './routes/market.js';
import macroRoutes from './routes/macro.js';
import analyzeRoutes from './routes/analyze.js';
import sipRoutes from './routes/sip.js';
import simulatorRoutes from './routes/simulator.js';
import { aiConfigured } from './services/claudeService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    aiConfigured: aiConfigured(),
    cacheTtlMinutes: Number(process.env.CACHE_TTL_MINUTES) || 15,
  });
});

app.use('/api/market', marketRoutes);
app.use('/api/macro', macroRoutes);
app.use('/api/analyze', analyzeRoutes);
app.use('/api/sip', sipRoutes);
app.use('/api/simulate', simulatorRoutes);

// Serve the built frontend (frontend/dist) in production, so this single
// service can be deployed on its own — the SPA and API share one origin.
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Central error handler.
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`India Market Advisor API running on http://localhost:${PORT}`);
  if (!aiConfigured()) {
    console.warn(
      '⚠  No Claude auth found. Run `claude setup-token` and add CLAUDE_CODE_OAUTH_TOKEN to backend/.env to enable AI endpoints.'
    );
  }
});
