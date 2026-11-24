import FeedbackBanner from '@/app/components/FeedbackBanner/FeedbackBanner';

export default function StudentFeedback({ correct, feedback }: { correct: boolean; feedback: string | null }) {
  return <FeedbackBanner correct={correct} explanation={feedback?.trim() ? feedback : null} />;
}
