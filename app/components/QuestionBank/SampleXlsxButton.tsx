'use client';

import { useRef, useState } from 'react';
import { downloadSampleWorkbook, type SampleWorkbookKind } from '@/app/utils/sampleWorkbook';

export default function SampleXlsxButton({ kind, className }: { kind: SampleWorkbookKind; className?: string }) {
  const busy = useRef(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={downloading}
        aria-busy={downloading}
        onClick={async () => {
          if (busy.current) return;
          busy.current = true;
          setDownloading(true);
          setError(null);
          try {
            await downloadSampleWorkbook(kind);
          } catch {
            setError('Could not download the Excel sample. Please try again.');
          } finally {
            busy.current = false;
            setDownloading(false);
          }
        }}
      >
        {downloading ? 'Preparing XLSX…' : 'Download sample XLSX'}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
