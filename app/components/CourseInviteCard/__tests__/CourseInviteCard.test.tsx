import { render, screen } from '@testing-library/react';
import CourseInviteCard from '../CourseInviteCard';

describe('CourseInviteCard', () => {
  it('shows the invite details and a Join link', () => {
    render(
      <CourseInviteCard
        courseTitle="Chemistry 101"
        section="Section A"
        professor="Professor Jane Smith"
        joinHref="/join"
      />
    );

    expect(screen.getByText(/invited to join/)).toBeInTheDocument();
    expect(screen.getByText(/Chemistry 101/)).toHaveTextContent('Chemistry 101Section AProfessor Jane Smith');
    expect(screen.getByRole('link', { name: 'Join' })).toHaveAttribute('href', '/join');
  });
});
