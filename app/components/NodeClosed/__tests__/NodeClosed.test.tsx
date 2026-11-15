import { render, screen } from '@testing-library/react';
import NodeClosed from '../NodeClosed';

const props = { correct: 4, total: 5, coursePercent: 10, lessonHref: '/lesson' };

describe('NodeClosed', () => {
  it('lets the student review the video on YouTube, with the other resources coming soon', () => {
    render(<NodeClosed {...props} videoUrl="https://youtu.be/abc" />);

    expect(screen.getByRole('heading', { name: 'Node Closed' })).toBeInTheDocument();
    expect(screen.getByText('This lesson is past due.')).toBeInTheDocument();
    const video = screen.getByRole('link', { name: 'Review Video' });
    expect(video).toHaveAttribute('href', 'https://youtu.be/abc');
    expect(video).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'Study Guide' })).toHaveAttribute('href', '/student/coming-soon');
    expect(screen.getByRole('link', { name: 'Practice Questions' })).toHaveAttribute('href', '/student/coming-soon');
    expect(screen.getByRole('link', { name: 'Return to Lesson' })).toHaveAttribute('href', '/lesson');
  });

  it('sends Review Video to "coming soon" when the node has no YouTube video', () => {
    render(<NodeClosed {...props} videoUrl={null} />);
    expect(screen.getByRole('link', { name: 'Review Video' })).toHaveAttribute('href', '/student/coming-soon');
  });
});
