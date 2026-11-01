import React from 'react';
import { render, screen } from '@testing-library/react';
import StudentDailyTimeline from '../StudentDailyTimeline';

describe('StudentDailyTimeline', () => {
  it('renders Today title and course lessons', () => {
    const data = [
      {
        courseId: 'c1',
        title: 'Course 1',
        code: 'C101',
        section: 'A',
        lessons: [
          { id: 'l1', title: 'Lesson One', openDate: new Date(), dueDate: null },
          { id: 'l2', title: 'Lesson Two', openDate: null, dueDate: new Date() },
        ],
      },
    ];
    render(<StudentDailyTimeline data={data} />);
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Course 1')).toBeInTheDocument();
    expect(screen.getByText('Lesson One')).toBeInTheDocument();
    expect(screen.getByText('Lesson Two')).toBeInTheDocument();
  });

  it('returns null when no data', () => {
    const { container } = render(<StudentDailyTimeline data={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
