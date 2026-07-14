import { Suspense } from 'react';
import ResultsClient from './results-client';

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-400">결과 불러오는 중...</p>
        </div>
      }
    >
      <ResultsClient />
    </Suspense>
  );
}
