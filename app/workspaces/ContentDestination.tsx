'use client';
import selectStyles from '@/app/components/Select/Select.module.css';
import { useRouter } from 'next/navigation';
export default function ContentDestination({
  kind,
  workspaces,
}: {
  kind: 'nodes' | 'lessons';
  workspaces: { id: string; name: string }[];
}) {
  const router = useRouter();
  return (
    <label>
      Content destination{' '}
      <select
        className={`${selectStyles.control} ${selectStyles.compact}`}
        value="personal"
        onChange={(e) =>
          router.push(
            e.target.value === 'personal' ? `/instructor/${kind}/new` : `/workspaces/${e.target.value}/${kind}/new`
          )
        }
      >
        <option value="personal">Personal</option>
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </label>
  );
}
