import FeedbackBanner from '@/app/components/FeedbackBanner/FeedbackBanner';
import MarkdownPreview from '@/app/components/QuestionBank/MarkdownPreview';

export default function StudentFeedback({ correct, feedback }: { correct: boolean; feedback: string | null }) {
  return (
    <>
      <FeedbackBanner correct={correct} />
      {feedback?.trim() && <MarkdownPreview content={feedback} />}
    </>
  );
}
