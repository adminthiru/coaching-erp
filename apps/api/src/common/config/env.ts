import { z } from 'zod';

/**
 * Fail fast and loudly at boot rather than at the first request that needs a
 * missing variable. Anything absent here is a deployment error, not a runtime one.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection string'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),

  /**
   * Spec §§69–71. Optional on purpose: every insight's *numbers* are computed
   * from the database, and only the written summary comes from Claude. Without
   * a key the product still reports the findings — it just does not narrate
   * them (see InsightsService).
   */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5'),

  /** Spec §73 — requests per minute per IP. */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(10_000).default(300),
});

export type Env = z.infer<typeof envSchema> & { corsOrigins: string[]; aiEnabled: boolean };

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  cached = {
    ...parsed.data,
    corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    aiEnabled: Boolean(parsed.data.ANTHROPIC_API_KEY),
  };
  return cached;
}
