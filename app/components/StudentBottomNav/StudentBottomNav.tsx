'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROUTES } from '@/app/routes';
import { HomeIcon, LessonsIcon, ProfileIcon, SettingsIcon } from './icons';
import a11y from '@/app/styles/a11y.module.css';
import styles from './StudentBottomNav.module.css';

const NAV_ITEMS = [
  { label: 'Home', href: ROUTES.studentHome, icon: <HomeIcon /> },
  { label: 'Lessons', href: ROUTES.comingSoon, icon: <LessonsIcon /> },
  { label: 'Profile', href: ROUTES.studentProfile, icon: <ProfileIcon /> },
  { label: 'Settings', href: ROUTES.studentSettings, icon: <SettingsIcon /> },
];

export default function StudentBottomNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.bar} aria-label="Student navigation">
      {NAV_ITEMS.map(({ label, href, icon }) =>
        // The current page's icon is highlighted and not a link, so it does nothing when clicked.
        pathname === href ? (
          <span key={label} className={`${styles.item} ${styles.active}`} aria-current="page">
            {icon}
            <span className={a11y.srOnly}>{label}</span>
          </span>
        ) : (
          <Link key={label} href={href} className={styles.item}>
            {icon}
            <span className={a11y.srOnly}>{label}</span>
          </Link>
        )
      )}
    </nav>
  );
}
