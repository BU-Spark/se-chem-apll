import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewNodePage from './page';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('NewNodePage checkpoint timestamps', () => {
  beforeEach(() => {
    push.mockReset();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the timestamp as a top-level question field', async () => {
    const user = userEvent.setup();
    render(<NewNodePage />);

    await user.type(screen.getByLabelText(/Title/), 'Safety video');
    await user.type(screen.getByLabelText(/Question prompt/), 'What should happen next?');
    await user.type(screen.getByLabelText('Minutes'), '1');
    await user.type(screen.getByLabelText('Seconds'), '30');
    await user.click(screen.getByRole('button', { name: 'Create node' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    const body = JSON.parse(request.body);

    expect(body.questions[0].timeOffsetSeconds).toBe(90);
    expect(body.questions[0].options).not.toHaveProperty('timeOffsetSeconds');
    expect(push).toHaveBeenCalledWith('/instructor/nodes');
  });

  it('allows duplicate checkpoint timestamps', async () => {
    const user = userEvent.setup();
    render(<NewNodePage />);

    await user.type(screen.getByLabelText(/Title/), 'Safety video');
    await user.type(screen.getByLabelText(/Question prompt/), 'First question');
    await user.type(screen.getByLabelText('Minutes'), '0');
    await user.type(screen.getByLabelText('Seconds'), '45');
    await user.click(screen.getByRole('button', { name: /Add checkpoint question/ }));

    const prompts = screen.getAllByLabelText(/Question prompt/);
    const minutes = screen.getAllByLabelText('Minutes');
    const seconds = screen.getAllByLabelText('Seconds');
    await user.type(prompts[1], 'Second question');
    await user.type(minutes[1], '0');
    await user.type(seconds[1], '45');
    await user.click(screen.getByRole('button', { name: 'Create node' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    const body = JSON.parse(request.body);
    expect(body.questions.map((question: { timeOffsetSeconds: number }) => question.timeOffsetSeconds)).toEqual([
      45, 45,
    ]);
  });

  it('submits a blank timestamp as null', async () => {
    const user = userEvent.setup();
    render(<NewNodePage />);

    expect(screen.getByText('Leave blank to show this question after the video.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Title/), 'Safety video');
    await user.type(screen.getByLabelText(/Question prompt/), 'Question after the video');
    await user.click(screen.getByRole('button', { name: 'Create node' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    const body = JSON.parse(request.body);
    expect(body.questions[0].timeOffsetSeconds).toBeNull();
  });

  it('blocks a partially entered timestamp', async () => {
    const user = userEvent.setup();
    render(<NewNodePage />);

    await user.type(screen.getByLabelText(/Title/), 'Safety video');
    await user.type(screen.getByLabelText(/Question prompt/), 'Checkpoint');
    await user.type(screen.getByLabelText('Minutes'), '1');
    await user.click(screen.getByRole('button', { name: 'Create node' }));

    expect(await screen.findByText('Enter both minutes and seconds, or leave both blank.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
