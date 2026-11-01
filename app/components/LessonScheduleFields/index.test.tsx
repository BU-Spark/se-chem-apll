import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LessonScheduleFields from './index';
import { emptyLessonSchedule } from '@/app/utils/lessonSubmissionPolicy';

function Editor() {
  const [value, setValue] = useState(emptyLessonSchedule);
  return <LessonScheduleFields value={value} onChange={(patch) => setValue((current) => ({ ...current, ...patch }))} />;
}

describe('lesson schedule fields', () => {
  it('supports hourly and daily rates and clears the deduction when disabled', () => {
    render(<Editor />);
    expect(screen.getByLabelText('Hide lesson after due date')).not.toBeChecked();
    fireEvent.click(screen.getByLabelText('Hide lesson after due date'));
    expect(screen.getByLabelText('Hide lesson after due date')).toBeChecked();
    fireEvent.change(screen.getByLabelText('Late submission penalty'), { target: { value: 'HOURLY' } });
    fireEvent.change(screen.getByLabelText('Deduction (%)'), { target: { value: '1' } });
    expect(screen.getByText(/80 becomes 79.2 after 1 hour/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Late submission penalty'), { target: { value: 'DAILY' } });
    fireEvent.change(screen.getByLabelText('Deduction (%)'), { target: { value: '10' } });
    expect(screen.getByText(/80 becomes 72 after 24 hours/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Late submission penalty'), { target: { value: 'NONE' } });
    expect(screen.queryByLabelText('Deduction (%)')).not.toBeInTheDocument();
    expect(screen.getByText('No late penalty.')).toBeInTheDocument();
  });
  it('lets instructors specify a precise UTC late deadline', () => {
    render(<Editor />);
    const field = screen.getByLabelText('Late submission deadline (UTC)');
    fireEvent.change(field, { target: { value: '2026-10-15T12:30' } });
    expect(field).toHaveValue('2026-10-15T12:30');
  });
  it('displays all dates to the minute and emits minute precision when a date is edited', () => {
    const onChange = jest.fn();
    render(
      <LessonScheduleFields
        value={{
          ...emptyLessonSchedule,
          openDate: '2026-10-10T12:30:12.123',
          dueDate: '2026-10-12T12:30:12.123',
          lateDeadline: '2026-10-15T12:30:12.123',
          hideAfterDue: true,
        }}
        onChange={onChange}
      />
    );
    expect(screen.getByLabelText('Hide lesson after due date')).toBeChecked();
    for (const [label, day] of [
      ['Open date', '10'],
      ['Due date', '12'],
      ['Late submission deadline', '15'],
    ]) {
      const field = screen.getByLabelText(`${label} (UTC)`);
      expect(field).toHaveValue(`2026-10-${day}T12:30`);
      expect(field).toHaveAttribute('step', '60');
    }
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Due date (UTC)'), { target: { value: '2026-10-12T14:00' } });
    expect(onChange).toHaveBeenCalledWith({ dueDate: '2026-10-12T14:00' });
  });
});
