/* eslint-disable @typescript-eslint/no-require-imports */
// Requires a newly created, disposable local database. Never resets a database.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const databaseUrl = process.env.MIGRATION_TEST_DATABASE_URL;
  assert(databaseUrl, 'Set MIGRATION_TEST_DATABASE_URL to an empty local spark_migration_test database.');
  const url = new URL(databaseUrl);
  assert(
    ['postgresql:', 'postgres:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      url.pathname === '/spark_migration_test' &&
      [...url.searchParams.keys()].every((key) => key === 'schema') &&
      (!url.searchParams.has('schema') || url.searchParams.get('schema') === 'public'),
    'Use a direct local PostgreSQL URL for spark_migration_test (public schema only).'
  );
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const env = { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl };
  const run = (...args) => {
    const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), ...args], {
      env,
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `prisma ${args[0]} ${args[1]} failed`);
  };
  try {
    const objects = await prisma.$queryRaw`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
      UNION ALL
      SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      UNION ALL
      SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
    `;
    assert.equal(objects.length, 0, 'Database must be empty; create a fresh disposable database.');
    run('migrate', 'deploy');
    run(
      'migrate',
      'diff',
      '--from-schema-datasource',
      'prisma/schema.prisma',
      '--to-schema-datamodel',
      'prisma/schema.prisma',
      '--exit-code'
    );
    // Prisma cannot represent these checks or triggers in schema.prisma.
    const checks = await prisma.$queryRaw`
      SELECT c.conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.contype = 'c' AND c.convalidated
    `;
    assert.deepEqual(
      checks.map((row) => row.conname).sort(),
      [
        'CourseLesson_late_policy_check',
        'NodeCheckpoint_nonnegative_timestamp',
        'NodeResponse_at_most_one_question_check',
        'attempt_score_valid',
        'submission_grades_valid',
      ].sort()
    );
    const triggers = await prisma.$queryRaw`
      SELECT t.tgname, c.relname, p.proname FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgenabled = 'O'
    `;
    assert.deepEqual(
      triggers.map((row) => `${row.tgname}:${row.relname}:${row.proname}`).sort(),
      [
        'immutable_completed_attempt:NodeAttempt:protect_completed_attempt',
        'immutable_response:NodeResponse:protect_response_history',
        'immutable_submission:LessonSubmission:protect_submission_history',
        'immutable_submission_attempt:SubmissionAttempt:protect_submission_history',
      ].sort()
    );
    run('migrate', 'deploy'); // A second deploy must be a no-op.
    console.log('Migration replay, schema comparison, and SQL safeguards passed.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
