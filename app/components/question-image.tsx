interface QuestionImageProps {
  src: string;
  questionNo: number;
}

/**
 * A scanned figure attached to a question. These are pre-scaled bitmaps whose
 * fine diagram detail must survive at 1:1, and they can be wider than the
 * viewport (the container scrolls horizontally on small screens). `next/image`
 * would resample and constrain them, so a plain `img` is intentional here.
 */
export function QuestionImage({ src, questionNo }: QuestionImageProps) {
  return (
    <div className="overflow-x-auto">
      {/* eslint-disable-next-line @next/next/no-img-element -- see component doc */}
      <img
        src={src}
        alt={`문제 ${questionNo}`}
        className="h-auto w-full min-w-[520px] max-w-none rounded-lg object-contain md:min-w-0"
      />
    </div>
  );
}
