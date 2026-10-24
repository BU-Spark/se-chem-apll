import { render, screen, within } from '@testing-library/react';
import InfoCard from '../InfoCard';
import InfoField from '../InfoField';

describe('InfoCard', () => {
  it('renders a labelled card with each field and every line of its value', () => {
    render(
      <InfoCard label="Instructor">
        <InfoField label="Instructor" lines={['Jane Smith']} />
        <InfoField label="Office Hours" lines={['Tuesdays & Fridays', 'SCI 201', '2-4PM']} fullWidth />
      </InfoCard>
    );

    const card = screen.getByRole('region', { name: 'Instructor' });
    expect(within(card).getByText('Jane Smith')).toBeInTheDocument();
    expect(within(card).getByText('Office Hours')).toBeInTheDocument();
    for (const line of ['Tuesdays & Fridays', 'SCI 201', '2-4PM']) {
      expect(within(card).getByText(line)).toBeInTheDocument();
    }
  });
});
