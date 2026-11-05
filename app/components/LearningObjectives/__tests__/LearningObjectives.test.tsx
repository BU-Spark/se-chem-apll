import { render, screen } from '@testing-library/react';
import LearningObjectives from '../LearningObjectives';

describe('LearningObjectives', () => {
  it('lists each objective under a heading', () => {
    render(<LearningObjectives objectives={['Balance chemical equations.', 'Identify the limiting reactant.']} />);

    expect(screen.getByRole('heading', { name: 'Learning Objectives' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Balance chemical equations.',
      'Identify the limiting reactant.',
    ]);
  });

  it('shows nothing when the node has no objectives', () => {
    const { container } = render(<LearningObjectives objectives={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
