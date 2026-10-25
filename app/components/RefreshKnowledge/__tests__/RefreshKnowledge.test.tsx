import { render, screen } from '@testing-library/react';
import RefreshKnowledge from '../RefreshKnowledge';

describe('RefreshKnowledge', () => {
  it('lists the learning objectives and continues to the video lesson', () => {
    render(
      <RefreshKnowledge
        lessonHref="/lesson"
        videoHref="/video"
        learningObjectives={['Balance chemical equations.', 'Identify the limiting reactant.']}
        correct={2}
        total={5}
        coursePercent={10}
      />
    );

    expect(screen.getByRole('heading', { name: 'Refresh your Knowledge' })).toBeInTheDocument();
    expect(screen.getByText('Balance chemical equations.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/lesson');
    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/video');
  });

  it('hides the objectives box when the node has none', () => {
    render(
      <RefreshKnowledge
        lessonHref="/l"
        videoHref="/v"
        learningObjectives={[]}
        correct={0}
        total={5}
        coursePercent={0}
      />
    );
    expect(screen.queryByRole('heading', { name: 'Learning Objectives' })).not.toBeInTheDocument();
  });
});
