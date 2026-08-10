-- AlterTable
ALTER TABLE "Node" ADD COLUMN "learningObjectives" TEXT[] DEFAULT ARRAY[]::TEXT[];
