import { prisma } from '@/lib/prisma';

/**
 * Loads the questions picked for an attempt, in the order they were picked.
 * Returns null if the instructor has since removed any of them.
 */
export async function getAttemptQuestions(quizQuestionIds: string[]) {
  const found = await prisma.quizQuestion.findMany({
    where: { id: { in: quizQuestionIds } },
    select: { id: true, prompt: true, options: true, correctIndices: true },
  });
  const byId = new Map(found.map((question) => [question.id, question]));
  const questions = quizQuestionIds.flatMap((id) => byId.get(id) ?? []);
  return questions.length === quizQuestionIds.length ? questions : null;
}
