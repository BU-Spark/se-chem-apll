import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server.node';
import DeadlineTime from './DeadlineTime';

function mockTimeZone(timeZone: string) {
  const options = Intl.DateTimeFormat().resolvedOptions();
  jest.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ ...options, timeZone });
}

afterEach(() => {
  jest.restoreAllMocks();
});

it('shows each deadline in the browser time zone and UTC, accounting for daylight saving and date changes', () => {
  mockTimeZone('America/New_York');
  const dueDate = '2026-10-31T02:30:00Z';
  const lateDeadline = '2026-11-03T02:30:00Z';
  render(
    <>
      <DeadlineTime isoDate={dueDate} />
      <DeadlineTime isoDate={lateDeadline} />
    </>
  );

  expect(screen.getByText('Oct 30, 2026, 10:30 PM EDT')).toHaveAttribute('datetime', dueDate);
  expect(screen.getByText('Oct 31, 2026, 2:30 AM UTC')).toHaveAttribute('datetime', dueDate);
  expect(screen.getByText('Nov 2, 2026, 9:30 PM EST')).toHaveAttribute('datetime', lateDeadline);
  expect(screen.getByText('Nov 3, 2026, 2:30 AM UTC')).toHaveAttribute('datetime', lateDeadline);
});

it('shows one timestamp when the browser already uses UTC', () => {
  mockTimeZone('UTC');
  render(<DeadlineTime isoDate="2026-10-31T02:30:00Z" />);

  expect(screen.getAllByRole('time')).toHaveLength(1);
  expect(screen.getByText('Oct 31, 2026, 2:30 AM UTC')).toBeVisible();
});

it('renders UTC on the server and adds local time without a hydration mismatch', () => {
  mockTimeZone('America/New_York');
  const deadline = <DeadlineTime isoDate="2026-10-31T02:30:00Z" />;
  const container = document.body.appendChild(document.createElement('div'));
  container.innerHTML = renderToString(deadline);
  expect(container).toHaveTextContent('Oct 31, 2026, 2:30 AM UTC');
  expect(container).not.toHaveTextContent('EDT');

  const onRecoverableError = jest.fn();
  const { getByText } = render(deadline, { container, hydrate: true, onRecoverableError });
  expect(getByText('Oct 30, 2026, 10:30 PM EDT')).toBeInTheDocument();
  expect(onRecoverableError).not.toHaveBeenCalled();
});
