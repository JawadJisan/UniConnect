import { describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';

// The OpenAPI document (PRD §3, §21; DECISIONS D46): it lists exactly the routes the app serves,
// and /api/docs serves it. Prisma and Redis are mocked; nothing here touches a database.

jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: {} }));
jest.unstable_mockModule('../src/lib/redis.js', () => ({ redis: {}, createRedis: jest.fn() }));

const { app } = await import('../src/app.js');
const { mountPathOf } = await import('../src/lib/mount.js');
const { OPERATIONS, buildOpenApiDocument, toOpenApiPath } = await import('../src/docs/openapi.js');

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

/** Every route the app serves under /api/v1, as "METHOD /path", walking mounted routers. */
function servedRoutes(stack: Layer[], prefix = ''): string[] {
  const found: string[] = [];
  for (const layer of stack) {
    if (layer.route) {
      const path = `${prefix}${layer.route.path === '/' ? '' : layer.route.path}` || '/';
      for (const method of Object.keys(layer.route.methods)) {
        if (method !== '_all') found.push(`${method.toUpperCase()} ${path}`);
      }
    } else if (layer.handle?.stack) {
      const at = mountPathOf(layer.handle);
      if (at !== undefined) found.push(...servedRoutes(layer.handle.stack, `${prefix}${at}`));
    }
  }
  return found;
}

const appStack = (app as unknown as { router: { stack: Layer[] } }).router.stack;

describe('OpenAPI document', () => {
  it('documents every /api/v1 route the app serves, and nothing it does not', () => {
    const served = servedRoutes(appStack)
      .filter((r) => r.includes(' /api/v1/'))
      .sort();
    const documented = OPERATIONS.map((op) => `${op.method.toUpperCase()} ${op.path}`).sort();
    expect(served.length).toBeGreaterThan(60);
    expect(documented).toEqual(served);
  });

  it('is a valid OpenAPI 3.0 document with every operation and its schemas', () => {
    const doc = buildOpenApiDocument();
    expect(doc.openapi).toBe('3.0.3');
    for (const op of OPERATIONS) {
      const entry = doc.paths[toOpenApiPath(op.path)]?.[op.method];
      expect(entry).toBeDefined();
      if (op.body) expect(entry!.requestBody).toBeDefined();
      if (op.query)
        expect(entry!.parameters?.some((p) => 'in' in p && p.in === 'query')).toBe(true);
      const pathParams = [...op.path.matchAll(/:(\w+)/g)].map((m) => m[1]);
      const declared = (entry!.parameters ?? [])
        .filter((p) => 'in' in p && p.in === 'path')
        .map((p) => ('name' in p ? p.name : ''));
      expect(declared.sort()).toEqual(pathParams.sort());
    }
    // Every $ref points at a component that exists.
    const refs = [...JSON.stringify(doc).matchAll(/"\$ref":"#\/components\/schemas\/([^"]+)"/g)];
    for (const [, name] of refs) expect(doc.components?.schemas?.[name!]).toBeDefined();
  });

  it('serves the document and the UI at /api/docs outside production', async () => {
    const json = await request(app).get('/api/docs/openapi.json');
    expect(json.status).toBe(200);
    expect(json.body.info.title).toBe('UniConnect API');
    expect(Object.keys(json.body.paths).length).toBeGreaterThan(60);

    const ui = await request(app).get('/api/docs/');
    expect(ui.status).toBe(200);
    expect(ui.text).toContain('swagger-ui');
  });
});
