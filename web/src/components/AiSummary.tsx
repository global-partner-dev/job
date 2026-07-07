import type { ReactNode } from 'react';

interface AiSummaryProps {
  text: string;
  className?: string;
}

export default function AiSummary({ text, className }: AiSummaryProps) {
  if (!text || !text.trim()) return null;

  const parts: ReactNode[] = text
    .split(/\*\*(.+?)\*\*/g)
    .map((part, index) =>
      index % 2 === 1 ? (
        <strong key={index} className="ai-em">
          {part}
        </strong>
      ) : (
        part
      ),
    );

  return (
    <p className={'text-sm leading-relaxed text-muted ' + (className || '')}>
      {parts}
    </p>
  );
}
