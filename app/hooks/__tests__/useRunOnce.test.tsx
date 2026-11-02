import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import useRunOnce from '../useRunOnce';

function Starter({ work }: { work: () => void }) {
  useRunOnce(work);
  return null;
}

describe('useRunOnce', () => {
  it('runs once even when React runs effects twice in development (StrictMode)', () => {
    const work = jest.fn();
    const { rerender } = render(
      <StrictMode>
        <Starter work={work} />
      </StrictMode>
    );
    rerender(
      <StrictMode>
        <Starter work={work} />
      </StrictMode>
    );
    expect(work).toHaveBeenCalledTimes(1);
  });
});
