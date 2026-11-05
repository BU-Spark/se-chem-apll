import { render, screen } from '@testing-library/react';
import KeepMovingForward from '../KeepMovingForward';

describe('KeepMovingForward', () => {
  it('encourages another try, with Back and Retry to the video', () => {
    render(<KeepMovingForward correct={1} total={5} coursePercent={10} lessonHref="/lesson" retryHref="/video" />);

    expect(screen.getByRole('heading', { name: 'Keep Moving Forward' })).toBeInTheDocument();
    expect(screen.getByText(/You.ve Got This!/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/lesson');
    expect(screen.getByRole('link', { name: 'Retry' })).toHaveAttribute('href', '/video');
  });
});
