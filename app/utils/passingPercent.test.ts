import { isValidPassingPercent } from './passingPercent';

describe('isValidPassingPercent', () => {
  it.each([0, 70, 100])('accepts %p', (value) => {
    expect(isValidPassingPercent(value)).toBe(true);
  });

  it.each([-1, 101, 70.5, null, undefined, '', '70', Number.NaN])('rejects %p', (value) => {
    expect(isValidPassingPercent(value)).toBe(false);
  });
});
