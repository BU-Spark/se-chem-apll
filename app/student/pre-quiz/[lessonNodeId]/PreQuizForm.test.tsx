import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PreQuizForm from './PreQuizForm';

const push = jest.fn();
const refresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

describe('PreQuizForm multiple-choice answers', () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    jest.spyOn(global, 'fetch').mockResolvedValue({} as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('submits all selected answer indexes', async () => {
    const user = userEvent.setup();
    render(
      <PreQuizForm
        lessonNodeId="lesson-node-1"
        lessonTitle="Safety"
        nodeTitle="Protective equipment"
        questions={[
          {
            id: 'question-1',
            prompt: 'Select all required equipment',
            options: { type: 'multipleChoice', choices: ['Gloves', 'Goggles', 'Sandals'] },
          },
        ]}
      />
    );

    const submit = screen.getByRole('button', { name: 'Submit pre-quiz' });
    expect(submit).toBeDisabled();

    const choices = screen.getAllByRole('checkbox');
    await user.click(choices[0]);
    await user.click(choices[1]);
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(JSON.parse(request.body).answers[0]).toEqual({
      questionId: 'question-1',
      selectedIndices: [0, 1],
    });
  });
});
