'use client';

import { useEffect } from 'react';
import { useRecentSearch } from '@/hooks/useRecentSearch';

interface Props {
  id: string;
  name: string;
  district: string;
}

export function ConstituencyTracker({ id, name, district }: Props) {
  const { addRecent } = useRecentSearch();

  useEffect(() => {
    addRecent({ id, name, district });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return null;
}
