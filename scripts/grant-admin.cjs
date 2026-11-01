/* eslint-disable @typescript-eslint/no-require-imports */
const { loadEnvConfig } = require('@next/env');
const { PrismaClient } = require('@prisma/client');
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--clerk-user-id' || !args[1].startsWith('user_'))
    throw new Error('Usage: npm run admin:grant -- --clerk-user-id user_...');
  const user = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(261015, 1)::text`;
    const target = await tx.user.findUnique({ where: { clerkUserId: args[1] } });
    if (!target) throw new Error('No linked user found. Sign in to the application first.');
    if (target.platformRole === 'ADMIN') return target;
    const updated = await tx.user.update({ where: { id: target.id }, data: { platformRole: 'ADMIN' } });
    await tx.roleAudit.create({
      data: {
        actorId: null,
        targetId: target.id,
        source: 'BOOTSTRAP',
        previousAppRole: target.appRole,
        newAppRole: target.appRole,
        previousPlatformRole: target.platformRole,
        newPlatformRole: 'ADMIN',
      },
    });
    return updated;
  });
  console.log(`Admin access granted to ${user.email} (${user.clerkUserId}).`);
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
