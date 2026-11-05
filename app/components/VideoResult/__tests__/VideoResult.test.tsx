import { render, screen } from '@testing-library/react';
import VideoResult from '../VideoResult';

const props = { correct: 4, total: 5, coursePercent: 10, lessonHref: '/l', rewatchHref: '/video', quizHref: '/quiz' };

describe('VideoResult', () => {
  it('says Great Job at or above the pass mark, with Rewatch and Continue only', () => {
    render(<VideoResult passed isFoundational {...props} />);
    expect(screen.getByRole('heading', { name: 'Great Job!' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rewatch' })).toHaveAttribute('href', '/video');
    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/quiz');
  });

  it('offers Back to the map instead of Rewatch when a regular node passes', () => {
    render(<VideoResult passed isFoundational={false} {...props} />);
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/l');
    expect(screen.queryByRole('link', { name: 'Rewatch' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/quiz');
  });

  it('suggests rewatching below the pass mark, with the same two buttons', () => {
    render(<VideoResult passed={false} isFoundational {...props} />);
    expect(screen.getByRole('heading', { name: 'Refresh Your Knowledge' })).toBeInTheDocument();
    expect(screen.getByText(/revisiting the video lesson/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rewatch' })).toHaveAttribute('href', '/video');
    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/quiz');
  });
});
