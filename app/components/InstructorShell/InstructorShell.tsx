import { UserButton } from '@clerk/nextjs';
import { canTeach, homeFor, isAdmin, type Principal } from '@/lib/auth/policy';
import SidebarNavigation from './SidebarNavigation';
import styles from './shell.module.css';

export default function InstructorShell({
  user,
  children,
}: {
  user: Pick<Principal, 'appRole' | 'platformRole'>;
  children: React.ReactNode;
}) {
  const teaching = canTeach(user);
  const items = [
    { href: '/workspaces', label: 'Workspaces' },
    ...(teaching
      ? [
          { href: '/instructor/nodes', label: 'Nodes' },
          { href: '/instructor/lessons', label: 'Lessons' },
          { href: '/instructor/courses', label: 'Courses' },
          { href: '/instructor/students', label: 'Students' },
        ]
      : [{ href: homeFor(user), label: 'My dashboard' }]),
    ...(isAdmin(user) ? [{ href: '/admin', label: 'Administration' }] : []),
    { href: '/debug-role', label: 'Switch role' },
  ];
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>Spark 26</span>
          <span className={styles.brandSub}>{teaching ? 'Instructor' : 'Workspaces'}</span>
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
        <SidebarNavigation items={items} />
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
