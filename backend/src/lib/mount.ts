import type { Express, Router } from 'express';

// Express 5 keeps no mount path on a router's layer, so the OpenAPI drift test (tests/openapi
// .test.ts) couldn't list the API's routes. Every API router is mounted through here instead,
// which remembers where. Nothing else reads it.

const mountPaths = new Map<Router, string>();

export function mount(parent: Express | Router, path: string, child: Router): void {
  (parent as Router).use(path, child);
  mountPaths.set(child, path);
}

/** The path `router` was mounted at, if it went through mount(). */
export function mountPathOf(router: unknown): string | undefined {
  return mountPaths.get(router as Router);
}
