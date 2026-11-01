-- Submission history retains questionKey and snapshot after the source question
-- is deleted. Both optional references may therefore be null, but never both set.
ALTER TABLE "NodeResponse" DROP CONSTRAINT "NodeResponse_one_question_fkey_check";
ALTER TABLE "NodeResponse" ADD CONSTRAINT "NodeResponse_at_most_one_question_check"
  CHECK ("checkpointQuestionId" IS NULL OR "quizQuestionId" IS NULL);
