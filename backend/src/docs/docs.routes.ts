import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { env } from '../config/env.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { buildOpenApiDocument } from './openapi.js';

// /api/docs: Swagger UI and the raw OpenAPI document (PRD §3, §21; DECISIONS D46). On by default
// outside production. In production it is off unless API_DOCS=on, and then for the super admin
// only: the document is the API's route map, which is no secret but needn't be public.

export const docsRouter = Router();

let document: ReturnType<typeof buildOpenApiDocument> | undefined;
const openApi = () => (document ??= buildOpenApiDocument());

if (env.NODE_ENV === 'production') docsRouter.use(requireAuth, requireRole(['super_admin']));

docsRouter.get('/openapi.json', (_req, res) => {
  res.json(openApi());
});

// The UI loads the document from the URL above rather than inlining it.
docsRouter.use(
  '/',
  swaggerUi.serveFiles(undefined, { swaggerUrl: '/api/docs/openapi.json' }),
  swaggerUi.setup(undefined, {
    swaggerUrl: '/api/docs/openapi.json',
    customSiteTitle: 'UniConnect API',
    swaggerOptions: { withCredentials: true },
  }),
);

export const docsEnabled = env.API_DOCS === 'on';
