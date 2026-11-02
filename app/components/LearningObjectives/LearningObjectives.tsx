import styles from './LearningObjectives.module.css';

function CheckCircleIcon() {
  return (
    <svg
      className={styles.icon}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-4.2-7.6" />
      <path d="m8 11.5 3.5 3.5L21 5.5" />
    </svg>
  );
}

// The node's learning objectives in a box; nothing when the node has none.
export default function LearningObjectives({ objectives }: { objectives: string[] }) {
  if (objectives.length === 0) return null;
  return (
    <section className={styles.box} aria-labelledby="learning-objectives">
      <h2 id="learning-objectives" className={styles.title}>
        Learning Objectives
      </h2>
      <ul className={styles.list}>
        {objectives.map((objective) => (
          <li key={objective} className={styles.item}>
            <CheckCircleIcon />
            {objective}
          </li>
        ))}
      </ul>
    </section>
  );
}
