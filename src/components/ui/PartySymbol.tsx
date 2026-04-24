import Image from 'next/image';
import type { Party } from '@/types';

interface PartySymbolProps {
  party: Pick<Party, 'abbreviation' | 'color' | 'symbolUrl'>;
  size?: number; // px, default 28
  className?: string;
}

export function PartySymbol({ party, size = 28, className = '' }: PartySymbolProps) {
  if (party.symbolUrl) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white ${className}`}
        style={{ width: size, height: size }}
      >
        <Image
          src={party.symbolUrl}
          alt={party.abbreviation}
          width={size}
          height={size}
          className="object-contain"
        />
      </span>
    );
  }

  // Fallback: colored circle with abbreviation initial
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: party.color,
        fontSize: Math.max(8, Math.round(size * 0.35)),
      }}
    >
      {party.abbreviation[0]}
    </span>
  );
}
