import { getFoundationalAccess } from './foundationalAccess';

describe('getFoundationalAccess', () => {
  it('exposes QEV when checkpoints exist (stub)', () => {
    expect(getFoundationalAccess({ isFoundational: true, hasCheckpoints: true, hasQuizBank: true })).toEqual({
      qevRequired: true,
      qevSkipped: false,
      qevLocked: false,
    });
  });

  it('does not require QEV when there are no checkpoints', () => {
    expect(getFoundationalAccess({ isFoundational: false, hasCheckpoints: false, hasQuizBank: true })).toEqual({
      qevRequired: false,
      qevSkipped: false,
      qevLocked: false,
    });
  });
});
