import { Suspense } from 'react';
import ExamClient from './exam-client';

export default function ExamPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-400 animate-pulse">문제 불러오는 중...</p>
        </div>
      }
    >
      <ExamClient />
    </Suspense>
  );
}
