'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './shell.module.css';
export default function SidebarNavigation({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation">
      <ul className={styles.navList}>
        {items.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`${styles.navItem} ${active ? styles.activeNavItem : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
