import { useEffect, useState } from 'react';
import { getAllRecords, readCache } from '../api/filemaker';

export function useAllRecords(layout, { slimForStorage, cacheVersion, findQuery, refreshKey } = {}) {
  const [state, setState] = useState(() => {
    const cached = readCache(layout, cacheVersion);
    if (cached) return { records: cached.records, total: cached.total, loading: false, error: null };
    return { records: [], total: 0, loading: true, error: null };
  });
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hasCachedData = state.records.length > 0;
    if (!hasCachedData) setState({ records: [], total: 0, loading: true, error: null });
    setFetching(true);

    getAllRecords(layout, {
      onProgress: ({ records, total }) => {
        if (cancelled) return;
        setState({ records: [...records], total, loading: false, error: null });
      },
      slimForStorage,
      cacheVersion,
      findQuery,
    })
      .then(() => { if (!cancelled) setFetching(false); })
      .catch((err) => {
        if (cancelled || err.name === 'AbortError') return;
        setState((s) => ({ ...s, loading: false, error: err.message ?? String(err) }));
        setFetching(false);
      });

    return () => { cancelled = true; };
  }, [layout, refreshKey]);

  return { ...state, fetching };
}
