import { render, screen } from '@testing-library/react';
import CenteredPage from '../CenteredPage';

describe('CenteredPage', () => {
  it('shows the page title as the main heading above its content', () => {
    render(
      <CenteredPage title="Profile">
        <p>Content</p>
      </CenteredPage>
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});
