import { getOrCreateStudent } from './getOrCreateStudent';

const mockAuth = jest.fn();
const mockCurrentUser = jest.fn();
const mockFindUnique = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
  currentUser: () => mockCurrentUser(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

describe('getOrCreateStudent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'clerk-1' });
    mockCurrentUser.mockResolvedValue({
      primaryEmailAddressId: 'e2',
      emailAddresses: [
        { id: 'e1', emailAddress: 'other@bu.edu' },
        { id: 'e2', emailAddress: ' Hannah@BU.edu ' },
      ],
      fullName: 'Hannah Yu',
      firstName: 'Hannah',
    });
  });

  it('returns null when nobody is signed in', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    expect(await getOrCreateStudent()).toBeNull();
  });

  it('finds the student by their normalized primary email', async () => {
    mockFindUnique.mockResolvedValue({ id: 's1', name: 'Hannah Yu', email: 'hannah@bu.edu' });
    expect(await getOrCreateStudent()).toEqual({ id: 's1', name: 'Hannah Yu', email: 'hannah@bu.edu' });
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { email: 'hannah@bu.edu' } });
  });

  it('creates the student on first visit', async () => {
    mockFindUnique.mockResolvedValue(null);
    await getOrCreateStudent();
    expect(mockCreate).toHaveBeenCalledWith({ data: { email: 'hannah@bu.edu', name: 'Hannah Yu' } });
  });

  it('backfills a missing name from Clerk', async () => {
    mockFindUnique.mockResolvedValue({ id: 's1', name: null, email: 'hannah@bu.edu' });
    await getOrCreateStudent();
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 's1' }, data: { name: 'Hannah Yu' } });
  });
});
