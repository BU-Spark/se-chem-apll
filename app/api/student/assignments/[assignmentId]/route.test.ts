import { GET, POST } from './route';
const mockStudent = jest.fn(),
  mockView = jest.fn(),
  mockSubmit = jest.fn(),
  mockStart = jest.fn(),
  mockFinish = jest.fn();
jest.mock('@/lib/auth/api', () => ({
  apiAccess: async () => {
    const user = await mockStudent();
    return user ? { user, error: null } : { error: { status: 403 } };
  },
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
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }),
  },
}));
const context = { params: Promise.resolve({ assignmentId: 'cl1' }) };
const request = (body: unknown) => ({ json: async () => body }) as Request;
beforeEach(() => {
  jest.clearAllMocks();
  mockStudent.mockResolvedValue({ id: 'authenticated-student' });
  mockSubmit.mockResolvedValue({ finalPercent: 80 });
  mockStart.mockResolvedValue({ id: 'a1' });
  mockFinish.mockResolvedValue({ score: 80 });
});
it('requires a signed-in student', async () => {
  mockStudent.mockResolvedValue(null);
  expect((await GET(request({}), context)).status).toBe(403);
  expect((await POST(request({}), context)).status).toBe(403);
  expect(mockView).not.toHaveBeenCalled();
  expect(mockSubmit).not.toHaveBeenCalled();
});
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
  expect(mockStart).toHaveBeenCalledWith('authenticated-student', 'cl1', 'n1', 'QUIZ', 'valid-key');
  await POST(
    request({ action: 'finish', attemptId: 'a1', answers: [{ questionId: 'q1', selectedIndices: [1] }] }),
    context
  );
  expect(mockFinish).toHaveBeenCalledWith('authenticated-student', 'cl1', 'a1', [
    { questionId: 'q1', selectedIndices: [1] },
  ]);
});
