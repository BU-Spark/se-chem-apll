import { render, screen } from '@testing-library/react';
import NodeIntro from '../NodeIntro';

describe('NodeIntro', () => {
  it('shows the node, its objectives, Back to the map, and Continue to the video', () => {
    render(
      <NodeIntro
        nodeTitle="Node 1"
        learningObjectives={['Balance chemical equations.']}
        lessonHref="/lesson"
        videoHref="/video"
      />
    );

    expect(screen.getByRole('heading', { name: 'Node 1' })).toBeInTheDocument();
    expect(screen.getByText(/Ready to learn\?/)).toBeInTheDocument();
    expect(screen.getByText('Balance chemical equations.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/lesson');
    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/video');
  });
});
