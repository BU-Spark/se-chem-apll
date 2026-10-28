import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LessonCreateForm from './LessonCreateForm';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

jest.mock('@/app/components/LessonRoadmapBuilder', () => ({
  __esModule: true,
  default: () => <div data-testid="roadmap-builder" />,
}));

describe('LessonCreateForm', () => {
  beforeEach(() => {
    push.mockReset();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'lesson-1' }) });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('saves an incomplete lesson as a draft', async () => {
    const user = userEvent.setup();
    render(<LessonCreateForm availableNodes={[]} />);

    await user.click(screen.getByRole('button', { name: 'Save as draft' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(JSON.parse(request.body)).toEqual(
      expect.objectContaining({
        title: '',
        slug: '',
        summary: '',
        lessonNodes: [],
        isDraft: true,
      })
    );
    expect(push).toHaveBeenCalledWith('/instructor/lessons');
  });
});
