import { render, screen } from '@testing-library/react';
import StudentQuizTaskList, { buildQuizTasks } from '../StudentQuizTaskList';

describe('buildQuizTasks', () => {
  it('returns no tasks without a quiz bank', () => {
    expect(
      buildQuizTasks({
        isFoundational: true,
        quizBankCount: 0,
        checkpointQuestionCount: 2,
        attempts: [],
      })
    ).toEqual([]);
  });

  it('shows available quiz when bank exists', () => {
    expect(
      buildQuizTasks({
        isFoundational: false,
        quizBankCount: 2,
        checkpointQuestionCount: 1,
        attempts: [],
      })
    ).toEqual([
      expect.objectContaining({
        key: 'quiz',
        label: 'Quiz',
        status: 'available',
        actionLabel: 'Start quiz',
      }),
    ]);
  });

  it('marks quiz completed when latest completed quiz attempt passed', () => {
    expect(
      buildQuizTasks({
        isFoundational: true,
        quizBankCount: 1,
        checkpointQuestionCount: 0,
        attempts: [
          {
            id: 'a1',
            isPassing: true,
            completedAt: new Date(),
            responses: [{ quizQuestionId: 'q1', checkpointQuestionId: null }],
          },
        ],
      })[0].status
    ).toBe('completed');
  });

  it('marks needs-retry when full coverage exists but latest attempt failed', () => {
    expect(
      buildQuizTasks({
        isFoundational: false,
        quizBankCount: 1,
        checkpointQuestionCount: 0,
        attempts: [
          {
            id: 'a1',
            isPassing: false,
            completedAt: new Date(),
            responses: [{ quizQuestionId: 'q1', checkpointQuestionId: null }],
          },
        ],
      })[0].status
    ).toBe('needs-retry');
  });
});

describe('StudentQuizTaskList', () => {
  it('renders quiz task as coming soon', () => {
    render(
      <StudentQuizTaskList
        isFoundational
        quizBankCount={1}
        checkpointQuestionCount={0}
        attempts={[]}
        lessonNodeId="ln-1"
      />
    );

    expect(screen.getByText('Quiz')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start quiz \(coming soon\)/ })).toBeDisabled();
    expect(screen.queryByText('Pre-quiz')).not.toBeInTheDocument();
  });
});
