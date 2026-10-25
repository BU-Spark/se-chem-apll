import buttons from '@/app/styles/buttons.module.css';
import styles from './NotSureDialog.module.css';

// Encouragement shown after "I'm Not Sure"; Next records the answer as not sure.
export default function NotSureDialog({ onNext }: { onNext: () => void }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="not-sure-title">
        <h2 id="not-sure-title" className={styles.title}>
          That&rsquo;s Okay!
        </h2>
        <p className={styles.text}>
          You don&rsquo;t need to know everything yet. We&rsquo;ll help you build the foundation you need to keep moving
          forward.
        </p>
        {/* autoFocus moves keyboard focus into the dialog when it opens. */}
        <button type="button" className={buttons.primary} onClick={onNext} autoFocus>
          Next
        </button>
      </div>
    </div>
  );
}
