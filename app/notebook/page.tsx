import { Suspense } from 'react';
import NotebookClient from './notebook-client';

export default function NotebookPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-400">불러오는 중...</p>
        </div>
      }
    >
      <NotebookClient />
    </Suspense>
  );
}
