import { z } from 'zod';

/** List contract (DECISIONS D9): `limit` defaults to 20 and is capped at 100. */
export const PAGE_LIMIT_DEFAULT = 20;
export const PAGE_LIMIT_MAX = 100;

/** `?page=&limit=` from a query string. Values arrive as strings, so they are coerced. */
export const paginationQueryShape = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
};

export const paginationMetaSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  total_pages: z.number().int(),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

/** Every list endpoint answers `{ success: true, data: T[], meta }`. */
export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export function paginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) };
}
