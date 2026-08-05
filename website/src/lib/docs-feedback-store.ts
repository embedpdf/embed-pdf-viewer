import 'server-only';

import { createHash } from 'node:crypto';

import { neon } from '@neondatabase/serverless';

import { frameworkFromDocsPath, type ValidatedFeedback } from './docs-feedback';

const RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 60;

export class FeedbackConfigurationError extends Error {}
export class FeedbackRateLimitError extends Error {}

function databaseUrl(): string {
  const value = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!value) {
    throw new FeedbackConfigurationError('The feedback database is not configured.');
  }
  return value;
}

function environmentName(): string {
  return (
    process.env.VERCEL_ENV ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development')
  );
}

function hashSalt(): string {
  const value = process.env.FEEDBACK_HASH_SALT;
  if (!value && environmentName() === 'production') {
    throw new FeedbackConfigurationError('FEEDBACK_HASH_SALT is required in production.');
  }
  return value ?? 'embedpdf-feedback-development-only';
}

function requestAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown';
}

function rateKey(request: Request): string {
  const day = new Date().toISOString().slice(0, 10);
  return createHash('sha256')
    .update(`${hashSalt()}:${day}:${requestAddress(request)}`)
    .digest('hex');
}

export async function saveDocsFeedback(feedback: ValidatedFeedback, request: Request) {
  const sql = neon(databaseUrl());
  const key = rateKey(request);

  const rateRows = (await sql`
    INSERT INTO docs_feedback_rate_limits (rate_key, window_started_at, request_count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (rate_key) DO UPDATE SET
      window_started_at = CASE
        WHEN docs_feedback_rate_limits.window_started_at < now() - (${RATE_WINDOW_SECONDS} * interval '1 second')
          THEN now()
        ELSE docs_feedback_rate_limits.window_started_at
      END,
      request_count = CASE
        WHEN docs_feedback_rate_limits.window_started_at < now() - (${RATE_WINDOW_SECONDS} * interval '1 second')
          THEN 1
        ELSE docs_feedback_rate_limits.request_count + 1
      END
    RETURNING request_count
  `) as Array<{ request_count: number }>;

  if ((rateRows[0]?.request_count ?? RATE_LIMIT + 1) > RATE_LIMIT) {
    throw new FeedbackRateLimitError('Too many feedback requests.');
  }

  const environment = environmentName();
  const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? 'local';
  const deployment = process.env.VERCEL_URL ?? null;
  const framework = frameworkFromDocsPath(feedback.path);
  const reasons = JSON.stringify(feedback.reasons);

  const rows = (await sql`
    INSERT INTO docs_feedback (
      id,
      site,
      path,
      framework,
      section_id,
      helpful,
      reasons,
      comment,
      docs_revision,
      environment,
      deployment,
      status
    ) VALUES (
      ${feedback.id}::uuid,
      ${feedback.site},
      ${feedback.path},
      ${framework},
      ${feedback.sectionId},
      ${feedback.helpful},
      ${reasons}::jsonb,
      ${feedback.comment},
      ${revision},
      ${environment},
      ${deployment},
      'new'
    )
    ON CONFLICT (id) DO UPDATE SET
      section_id = EXCLUDED.section_id,
      helpful = EXCLUDED.helpful,
      reasons = CASE
        WHEN EXCLUDED.reasons = '[]'::jsonb
          AND EXCLUDED.comment IS NULL
          AND docs_feedback.helpful = EXCLUDED.helpful
          THEN docs_feedback.reasons
        ELSE EXCLUDED.reasons
      END,
      comment = CASE
        WHEN EXCLUDED.reasons = '[]'::jsonb
          AND EXCLUDED.comment IS NULL
          AND docs_feedback.helpful = EXCLUDED.helpful
          THEN docs_feedback.comment
        ELSE EXCLUDED.comment
      END,
      docs_revision = EXCLUDED.docs_revision,
      environment = EXCLUDED.environment,
      deployment = EXCLUDED.deployment,
      status = 'new',
      updated_at = now()
    WHERE docs_feedback.site = EXCLUDED.site
      AND docs_feedback.path = EXCLUDED.path
    RETURNING id, docs_revision
  `) as Array<{ id: string; docs_revision: string }>;

  if (!rows[0]) {
    throw new Error('Feedback id is already associated with another page.');
  }

  return rows[0];
}
