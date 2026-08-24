import { render, screen, within } from '@testing-library/react';
import LessonsPage from './page';

const mockAuth = jest.fn();
const mockFindMany = jest.fn();

jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    lesson: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}));

describe('LessonsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'instructor-1' });
    mockFindMany.mockResolvedValue([
      { id: 'draft-lesson', title: '', slug: null, isDraft: true, lessonNodes: [] },
      { id: 'published-lesson', title: 'Published lesson', slug: 'published', isDraft: false, lessonNodes: [] },
    ]);
  });

  it('requests drafts first and renders draft, untitled, and missing-slug states', async () => {
    render(await LessonsPage());

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ isDraft: 'desc' }, { updatedAt: 'desc' }] })
    );

    const cards = screen.getAllByRole('listitem');
    expect(within(cards[0]).getByText('Untitled lesson')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Draft')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Slug not set')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Published lesson')).toBeInTheDocument();
    expect(within(cards[1]).queryByText('Draft')).not.toBeInTheDocument();
  });
});
