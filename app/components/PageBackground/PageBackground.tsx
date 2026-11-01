import styles from './PageBackground.module.css';

/*
 * Why this exists: without it, the student and sign-in pages show two blue lines on the
 * left and right sides of the screen.
 *
 * The cause is in app/globals.css: the whole app has a blue background, and every page sits
 * inside a container with space on its sides, so that blue shows through. We chose not to
 * change app/globals.css, because that would also change the instructor pages.
 * Instead, this puts a cream layer behind the page that covers the whole screen.
 */
export default function PageBackground() {
  return <div className={styles.background} aria-hidden="true" />;
}
