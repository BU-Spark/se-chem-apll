-- Remember which quiz bank questions were randomly picked for each attempt.
ALTER TABLE "NodeAttempt" ADD COLUMN "quizQuestionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
