'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './QuestionBank.module.css';

export default function VariantActions({
  number,
  onDuplicate,
  onDelete,
}: {
  number: number;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  function close(restoreFocus = false) {
    setPosition(null);
    if (restoreFocus) trigger.current?.focus();
  }
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector('button')?.focus();
    function outside(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node))
        setPosition(null);
    }
    const reposition = () => setPosition(null);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [position]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.variantIconButton}
        aria-label={`Actions for variant ${number}`}
        aria-haspopup="menu"
        aria-expanded={!!position}
        aria-controls={position ? id : undefined}
        onClick={() => {
          if (position) {
            close();
            return;
          }
          const bounds = trigger.current!.getBoundingClientRect();
          setPosition({
            top: bounds.bottom + 4 > window.innerHeight - 92 ? Math.max(8, bounds.top - 92) : bounds.bottom + 4,
            left: Math.max(8, Math.min(bounds.right - 150, window.innerWidth - 158)),
          });
        }}
      >
        ⋯
      </button>
      {position &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="menu"
            aria-label={`Variant ${number} actions`}
            className={styles.variantMenu}
            style={position}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close(true);
              }
              if (event.key === 'Tab') close(true);
              const items = Array.from(menu.current?.querySelectorAll('button') ?? []);
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? items.length - 1
                      : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                items[next]?.focus();
              }
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                onDuplicate();
              }}
            >
              Duplicate variant
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.variantMenuDelete}
              onClick={() => {
                close();
                onDelete();
              }}
            >
              Delete variant
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
