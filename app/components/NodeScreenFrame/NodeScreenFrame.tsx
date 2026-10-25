import Link from 'next/link';
import styles from './NodeScreenFrame.module.css';

// Full-width card used by every node screen, with an ✕ in the corner that leaves the node.
export default function NodeScreenFrame({ closeHref, children }: { closeHref: string; children: React.ReactNode }) {
  return (
    <div className={styles.frame}>
      <Link href={closeHref} className={styles.close} aria-label="Close and return to the lesson">
        ✕
      </Link>
      {children}
    </div>
  );
}
