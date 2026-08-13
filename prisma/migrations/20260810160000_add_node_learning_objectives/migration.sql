-- AlterTable
ALTER TABLE "Node" ADD COLUMN "learningObjectives" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
