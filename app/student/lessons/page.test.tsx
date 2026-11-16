import { render, screen, within } from '@testing-library/react';
import StudentLessonsPage from './page';

const mockGetLessonsToDo = jest.fn();

jest.mock('@/lib/auth/server', () => ({ requireStudent: async () => ({ id: 'student-1' }) }));
jest.mock('@/lib/studentCourses', () => ({ getLessonsToDo: (...args: unknown[]) => mockGetLessonsToDo(...args) }));

const lesson = (id: string, title: string, dueDate: Date | null, status = 'NOT_STARTED') => ({
  id,
  title,
  status,
  dueDate,
  courseId: 'c1',
  courseTitle: 'Chem 101',
});

describe('StudentLessonsPage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists the lessons to do, in order, each linking to its lesson map', async () => {
    mockGetLessonsToDo.mockResolvedValue([
      // 11:59 PM in Boston on Nov 20 is already Nov 21 in UTC.
      lesson('a', 'Atoms', new Date('2026-11-21T04:59:00Z'), 'IN_PROGRESS'),
      lesson('b', 'Bonds', null),
    ]);
    render(await StudentLessonsPage());

    expect(mockGetLessonsToDo).toHaveBeenCalledWith('student-1');
    expect(screen.getByRole('heading', { name: 'Lessons' })).toBeInTheDocument();
    const links = within(screen.getByRole('list')).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/student/courses/c1/lessons/a',
      '/student/courses/c1/lessons/b',
    ]);
    for (const text of ['Atoms', 'Chem 101', 'Due Nov 20', 'In progress']) expect(links[0]).toHaveTextContent(text);
    for (const text of ['Bonds', 'No due date', 'Not started']) expect(links[1]).toHaveTextContent(text);
  });

  it('says so when there is nothing left to do', async () => {
    mockGetLessonsToDo.mockResolvedValue([]);
    render(await StudentLessonsPage());
    expect(screen.getByText('You’re all caught up!')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
