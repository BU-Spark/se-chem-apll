ALTER TABLE "NodeCheckpoint" ALTER COLUMN "timeOffsetSeconds" DROP NOT NULL;
ALTER TABLE "NodeCheckpoint" ADD COLUMN "checkpointKey" TEXT, ADD COLUMN "placementHint" TEXT;
UPDATE "NodeCheckpoint" SET "checkpointKey" = 'checkpoint-' || ("sortOrder" + 1)::text;
ALTER TABLE "NodeCheckpoint" ALTER COLUMN "checkpointKey" SET NOT NULL;
CREATE UNIQUE INDEX "NodeCheckpoint_nodeId_checkpointKey_key" ON "NodeCheckpoint"("nodeId", "checkpointKey");
ALTER TABLE "NodeCheckpoint" ADD CONSTRAINT "NodeCheckpoint_nonnegative_timestamp" CHECK ("timeOffsetSeconds" IS NULL OR "timeOffsetSeconds" >= 0);
