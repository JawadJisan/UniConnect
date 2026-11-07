import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));

// Better Auth mounts here, at /api/auth/*splat. It must stay before express.json().

app.use(express.json());

app.get('/api/v1/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', service: 'uniconnect-api' } });
});
