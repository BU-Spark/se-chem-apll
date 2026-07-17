import React from 'react';
import { render, screen } from '@testing-library/react';
import StudentQuizTaskList, { buildQuizTasks } from '../StudentQuizTaskList';

describe('buildQuizTasks', () => {
  it('locks regular quiz until pre-quiz is completed', () => {
    const tasks = buildQuizTasks({
      preQuestionCount: 2,
      regularQuestionCount: 3,
      attempts: [],
    });

    expect(tasks[0]).toMatchObject({ key: 'pre', status: 'available' });
    expect(tasks[1]).toMatchObject({ key: 'regular', status: 'locked' });
  });

  it('marks regular quiz available when pre-quiz is completed', () => {
    const tasks = buildQuizTasks({
      preQuestionCount: 1,
      regularQuestionCount: 2,
      attempts: [
        {
          id: 'a1',
          isPassing: null,
          completedAt: new Date(),
          responses: [{ question: { id: 'q-pre-1', isPreLecture: true } }],
        },
      ],
    });

    expect(tasks[0]).toMatchObject({ key: 'pre', status: 'completed' });
    expect(tasks[1]).toMatchObject({ key: 'regular', status: 'available' });
  });

  it('marks regular quiz needs-retry when latest completed attempt failed', () => {
    const tasks = buildQuizTasks({
      preQuestionCount: 0,
      regularQuestionCount: 2,
      attempts: [
        {
          id: 'a1',
          isPassing: false,
          completedAt: new Date(),
          responses: [{ question: { id: 'q-reg-1', isPreLecture: false } }],
        },
      ],
    });

    expect(tasks[0]).toMatchObject({ key: 'regular', status: 'needs-retry' });
  });
});

describe('StudentQuizTaskList', () => {
  it('renders pre-quiz before quiz with status badges', () => {
    render(<StudentQuizTaskList preQuestionCount={1} regularQuestionCount={1} attempts={[]} lessonNodeId="ln-1" />);

    const preQuiz = screen.getByText('Pre-quiz');
    const quiz = screen.getByText('Quiz');
    expect(preQuiz.compareDocumentPosition(quiz) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Locked')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start pre-quiz' })).toHaveAttribute('href', '/student/pre-quiz/ln-1');
  });
});
