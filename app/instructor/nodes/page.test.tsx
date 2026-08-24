import { render, screen, within } from '@testing-library/react';
import NodesPage from './page';

const mockAuth = jest.fn();
const mockFindMany = jest.fn();

jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    node: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}));

describe('NodesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'instructor-1' });
    mockFindMany.mockResolvedValue([
      {
        id: 'draft-node',
        title: '',
        summary: null,
        videoUrl: null,
        isDraft: true,
        _count: { checkpoints: 0, quizQuestions: 0 },
      },
      {
        id: 'published-node',
        title: 'Published node',
        summary: 'Ready to use',
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        isDraft: false,
        _count: { checkpoints: 1, quizQuestions: 2 },
      },
    ]);
  });

  it('requests drafts first and renders draft and untitled states', async () => {
    render(await NodesPage());

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ isDraft: 'desc' }, { updatedAt: 'desc' }] })
    );

    const cards = screen.getAllByRole('listitem');
    expect(within(cards[0]).getByText('Untitled node')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Draft')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Published node')).toBeInTheDocument();
    expect(within(cards[1]).queryByText('Draft')).not.toBeInTheDocument();
  });
});
