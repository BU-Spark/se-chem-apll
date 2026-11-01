import Link from 'next/link';
import styles from './grid.module.css';

export function EditorTitle({
  href,
  title,
  destination = 'editor',
}: {
  href: string;
  title: string;
  destination?: string;
}) {
  return (
    <span className={styles.editorTitle}>
      <Link className={styles.titleLink} href={href}>
        {title}
      </Link>
      <a
        className={styles.newTabLink}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${title} ${destination} in new tab`}
        title={`Open ${destination} in new tab`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M14 3h7v7M21 3l-10 10M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
        </svg>
      </a>
    </span>
  );
}
