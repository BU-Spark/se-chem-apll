import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import NodeEditForm from './NodeEditForm';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('NodeEditForm checkpoint timestamps', () => {
  beforeEach(() => {
    push.mockReset();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads and preserves an existing timestamp in the PATCH payload', async () => {
    const now = new Date();
    const node: ComponentProps<typeof NodeEditForm>['node'] = {
      id: 'node-1',
      title: 'Safety video',
      summary: null,
      videoUrl: 'https://example.com/video.mp4',
      muxPlaybackId: null,
      thumbnailUrl: null,
      estimatedMinutes: null,
      createdAt: now,
      updatedAt: now,
      questions: [
        {
          id: 'question-1',
          nodeId: 'node-1',
          sortOrder: 0,
          prompt: 'What should happen next?',
          options: { type: 'multipleChoice', choices: ['A', 'B'] },
          correctIndex: 0,
          isPreLecture: false,
          timeOffsetSeconds: 125,
          createdAt: now,
          updatedAt: now,
        },
      ],
    };

    const user = userEvent.setup();
    render(<NodeEditForm node={node} />);

    expect(screen.getByLabelText('Minutes')).toHaveValue(2);
    expect(screen.getByLabelText('Seconds')).toHaveValue(5);

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    const body = JSON.parse(request.body);

    expect(body.questions[0].timeOffsetSeconds).toBe(125);
    expect(body.questions[0].options).not.toHaveProperty('timeOffsetSeconds');
    expect(push).toHaveBeenCalledWith('/instructor/nodes');
  });

  it('loads and preserves an untagged checkpoint question', async () => {
    const now = new Date();
    const node: ComponentProps<typeof NodeEditForm>['node'] = {
      id: 'node-1',
      title: 'Safety video',
      summary: null,
      videoUrl: 'https://example.com/video.mp4',
      muxPlaybackId: null,
      thumbnailUrl: null,
      estimatedMinutes: null,
      createdAt: now,
      updatedAt: now,
      questions: [
        {
          id: 'question-1',
          nodeId: 'node-1',
          sortOrder: 0,
          prompt: 'Question after the video',
          options: { type: 'multipleChoice', choices: ['A', 'B'] },
          correctIndex: 0,
          isPreLecture: false,
          timeOffsetSeconds: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    };

    const user = userEvent.setup();
    render(<NodeEditForm node={node} />);

    expect(screen.getByText('Leave blank to show this question after the video.')).toBeInTheDocument();
    expect(screen.getByLabelText('Minutes')).toHaveValue(null);
    expect(screen.getByLabelText('Seconds')).toHaveValue(null);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    const body = JSON.parse(request.body);
    expect(body.questions[0].timeOffsetSeconds).toBeNull();
  });
});
