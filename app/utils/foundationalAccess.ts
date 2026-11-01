/**
 * Foundational vs regular access helpers.
 *
 * Stub for this pass: both foundational and regular nodes expose QEV when checkpoint
 * content exists. Real rules (foundational → quiz first; fail quiz → require QEV) land
 * with the student quiz follow-up.
 */
export type FoundationalAccess = {
  qevRequired: boolean;
  qevSkipped: boolean;
  qevLocked: boolean;
};

export function getFoundationalAccess(input: {
  isFoundational: boolean;
  hasCheckpoints: boolean;
  hasQuizBank: boolean;
}): FoundationalAccess {
  const { hasCheckpoints } = input;

  return {
    qevRequired: hasCheckpoints,
    qevSkipped: false,
    qevLocked: false,
  };
}
