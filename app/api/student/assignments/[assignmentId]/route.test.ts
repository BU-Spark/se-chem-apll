/** @jest-environment node */
import { GET, POST } from './route';
import { appUser } from '@/test/mocks/appIdentity';
const mockStudent = jest.fn(),
  mockView = jest.fn(),
  mockSubmit = jest.fn(),
  mockStart = jest.fn(),
  mockFinish = jest.fn();
jest.mock('@/lib/auth/identity', () => ({
  getAppUser: () => mockStudent(),
}));
jest.mock('@/lib/submissions/service', () => ({
  assignmentView: (...a: unknown[]) => mockView(...a),
  submitLesson: (...a: unknown[]) => mockSubmit(...a),
  startAttempt: (...a: unknown[]) => mockStart(...a),
  finishAttempt: (...a: unknown[]) => mockFinish(...a),
  SubmissionError: class extends Error {
    constructor(
      message: string,
      public status = 422
    ) {
      super(message);
    }
  },
}));
const context = { params: Promise.resolve({ assignmentId: 'cl1' }) };
const request = (body: unknown) => ({ json: async () => body }) as Request;
beforeEach(() => {
  jest.clearAllMocks();
  mockStudent.mockResolvedValue(appUser({ id: 'authenticated-student', appRole: 'STUDENT' }));
  mockView.mockResolvedValue({ id: 'cl1', activeAttempt: { id: 'older' } });
  mockSubmit.mockResolvedValue({ finalPercent: 80 });
  mockStart.mockResolvedValue({ id: 'a1' });
  mockFinish.mockResolvedValue({ score: 80 });
});
it.each([
  [null, 401, 'Unauthorized'],
  [appUser({ appRole: 'INSTRUCTOR' }), 403, 'Forbidden'],
] as const)('requires a signed-in student: %p', async (user, status, error) => {
  mockStudent.mockResolvedValue(user);
  for (const handler of [GET, POST]) {
    const response = await handler(request({}), context);
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
  }
  expect(mockView).not.toHaveBeenCalled();
  expect(mockSubmit).not.toHaveBeenCalled();
  expect(mockStart).not.toHaveBeenCalled();
  expect(mockFinish).not.toHaveBeenCalled();
});
it.each([
  ['', undefined],
  ['&attempt=older', 'older'],
] as const)(
  'loads the assignment using the authenticated identity and selected attempt: %s',
  async (query, attempt) => {
    const response = await GET(
      new Request(`http://localhost/api/student/assignments/cl1?studentId=other${query}`),
      context
    );
    expect(mockView).toHaveBeenCalledWith('authenticated-student', 'cl1', attempt);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({ id: 'cl1', activeAttempt: { id: 'older' } });
  }
);
it('uses the authenticated identity and ignores supplied grades and timestamps', async () => {
  await POST(
    request({
      action: 'submit',
      key: 'valid-key',
      studentId: 'other',
      rawPercent: 100,
      finalPercent: 100,
      submittedAt: '2020-01-01',
    }),
    context
  );
  expect(mockSubmit).toHaveBeenCalledWith('authenticated-student', 'cl1', 'valid-key');
});
it('validates request keys and answer structure before processing', async () => {
  expect((await POST(request({ action: 'submit', key: 'x' }), context)).status).toBe(400);
  expect(
    (await POST(request({ action: 'finish', attemptId: 'a1', answers: [null], key: 'valid-key' }), context)).status
  ).toBe(400);
  expect(mockFinish).not.toHaveBeenCalled();
});
it('starts and finishes assignment-scoped attempts', async () => {
  await POST(request({ action: 'start', nodeId: 'n1', kind: 'QUIZ', key: 'valid-key' }), context);
  expect(mockStart).toHaveBeenCalledWith('authenticated-student', 'cl1', 'n1', 'QUIZ', 'valid-key', undefined);
  await POST(
    request({ action: 'finish', attemptId: 'a1', answers: [{ questionId: 'q1', selectedIndices: [1] }] }),
    context
  );
  expect(mockFinish).toHaveBeenCalledWith('authenticated-student', 'cl1', 'a1', [
    { questionId: 'q1', selectedIndices: [1] },
  ]);
});
it('passes the selected attempt ID through when resuming', async () => {
  await POST(request({ action: 'start', nodeId: 'n1', kind: 'QUIZ', key: 'valid-key', attemptId: 'older' }), context);
  expect(mockStart).toHaveBeenCalledWith('authenticated-student', 'cl1', 'n1', 'QUIZ', 'valid-key', 'older');
});
it.each([null, '', 123, {}])('rejects an invalid selected attempt ID: %p', async (attemptId) => {
  expect(
    (await POST(request({ action: 'start', nodeId: 'n1', kind: 'QUIZ', key: 'valid-key', attemptId }), context)).status
  ).toBe(400);
  expect(mockStart).not.toHaveBeenCalled();
});
