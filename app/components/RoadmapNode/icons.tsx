// Icons for roadmap nodes, matching the design's node key.
const ICON_PROPS = {
  width: 30,
  height: 30,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export function StarIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </svg>
  );
}

export function HexagonIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 3.5 19.4 7.75v8.5L12 20.5l-7.4-4.25v-8.5z" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.6-4.9" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </svg>
  );
}

export function CrossCircleIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9.2 9.2 5.6 5.6m0-5.6-5.6 5.6" />
    </svg>
  );
}
