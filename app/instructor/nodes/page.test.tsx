import { appUser, mockGetAppUser } from '@/test/mocks/appIdentity';
jest.mock('@/lib/auth/identity', () => ({
  getAppUser: jest.requireActual('@/test/mocks/appIdentity').mockGetAppUser,
}));
import { render, screen } from '@testing-library/react';
import NodesPage from './page';

const mockFindMany = jest.fn();
const mockLessons = jest.fn();

const mockGrid = jest.fn((props: { nodes: unknown[] }) => <div data-testid="nodes-grid">{props.nodes.length}</div>);
jest.mock('./NodesGrid', () => ({ __esModule: true, default: (props: unknown) => mockGrid(props as never) }));


jest.mock('@/lib/prisma', () => ({
  prisma: {
    lesson: { findMany: (...args: unknown[]) => mockLessons(...args) },
    node: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}));

describe('NodesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAppUser.mockResolvedValue(appUser({ clerkUserId: 'instructor-1' }));
    mockLessons.mockResolvedValue([{ id: 'my-lesson', title: 'My lesson', isDraft: true }]);
    mockFindMany.mockResolvedValue([
      {
        id: 'draft-node',
        tags: ['Chemistry'],
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        lessonNodes: [],
        title: '',
        summary: null,
        videoUrl: null,
        isDraft: true,
        _count: { checkpoints: 0, quizQuestions: 0 },
      },
      {
        id: 'published-node',
        tags: ['Atoms'],
        createdAt: new Date('2026-02-01'),
        updatedAt: new Date('2026-02-01'),
        lessonNodes: [
          { lesson: { id: 'my-lesson', title: 'My lesson' } },
          { lesson: { id: 'my-lesson', title: 'My lesson' } },
        ],
        title: 'Published node',
        summary: 'Ready to use',
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        isDraft: false,
        _count: { checkpoints: 1, quizQuestions: 2 },
      },
    ]);
  });

  it('requests drafts first and renders draft and untitled states', async () => {
    render(await NodesPage({}));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ isDraft: 'desc' }, { updatedAt: 'desc' }] })
    );

    expect(screen.getByTestId('nodes-grid')).toBeInTheDocument();
    expect(mockGrid).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: 'draft-node' }),
          expect.objectContaining({ id: 'published-node' }),
        ]),
      })
    );
  });
  it('keeps node access and lesson metadata restricted to the instructor', async () => {
    await NodesPage({});
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ createdByClerkId: 'instructor-1' }, { createdByClerkId: null }] },
        select: expect.objectContaining({
          lessonNodes: {
            where: { lesson: { createdByClerkId: 'instructor-1' } },
            select: { lesson: { select: { id: true, title: true } } },
          },
        }),
      })
    );
    expect(mockLessons).toHaveBeenCalledWith(expect.objectContaining({ where: { createdByClerkId: 'instructor-1' } }));
  });
  it('passes URL filters and authorized metadata to the client grid', async () => {
    render(
      await NodesPage({
        searchParams: Promise.resolve({ q: 'Ready', tag: 'ATOMS', usage: 'mine', lesson: 'my-lesson', sort: 'az' }),
      })
    );
    expect(mockGrid).toHaveBeenCalledWith(
      expect.objectContaining({
        initialFilters: { q: 'Ready', tags: ['atoms'], usage: 'mine', lesson: 'my-lesson', sort: 'az', status: 'all' },
        lessons: [{ id: 'my-lesson', title: 'My lesson', isDraft: true }],
      })
    );
  });
});
