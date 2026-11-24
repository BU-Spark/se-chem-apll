'use client';
import selectStyles from '@/app/components/Select/Select.module.css';
import { useRouter } from 'next/navigation';
export default function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: string;
  workspaces: { id: string; name: string }[];
}) {
  const router = useRouter();
  return (
    <label>
      Workspace
      <select
        className={`${selectStyles.control} ${selectStyles.compact}`}
        value={current}
        onChange={(e) =>
          router.push(e.target.value === 'personal' ? '/instructor/nodes' : `/workspaces/${e.target.value}`)
        }
      >
        <option value="" disabled>
          Select workspace
        </option>
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </label>
  );
}
