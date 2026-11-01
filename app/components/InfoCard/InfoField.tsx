import styles from './InfoField.module.css';

interface InfoFieldProps {
  label: string;
  // Each entry is shown on its own line.
  lines: string[];
  // Take a full row of the card instead of sitting beside other fields.
  fullWidth?: boolean;
}

export default function InfoField({ label, lines, fullWidth = false }: InfoFieldProps) {
  return (
    <div className={fullWidth ? `${styles.field} ${styles.fullWidth}` : styles.field}>
      <p className={styles.label}>{label}</p>
      {lines.map((line) => (
        <p key={line} className={styles.value}>
          {line}
        </p>
      ))}
    </div>
  );
}
