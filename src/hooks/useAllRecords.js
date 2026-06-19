import { useEffect, useState } from 'react';
import { getAllRecords, subscribeCacheUpdates } from '../api/filemaker';

export function useAllRecords(layout, { slimForStorage, cacheVersion, findQuery, sort, refreshKey } = {}) {
  const [state, setState] = useState({ records: [], total: 0, loading: true, error: null });
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ records: [], total: 0, loading: true, error: null });
    setFetching(true);

    getAllRecords(layout, {
      onProgress: ({ records, total }) => {
        if (cancelled) return;
        setState({ records: [...records], total, loading: false, error: null });
      },
      slimForStorage,
      cacheVersion,
      findQuery,
      sort,
    })
      .then(() => { if (!cancelled) setFetching(false); })
      .catch((err) => {
        if (cancelled || err.name === 'AbortError') return;
        setState((s) => ({ ...s, loading: false, error: err.message ?? String(err) }));
        setFetching(false);
      });

    return () => { cancelled = true; };
  }, [layout, refreshKey]);

  // Keep state in sync with surgical record patches from patchCachedRecord
  useEffect(() => {
    return subscribeCacheUpdates(layout, cacheVersion, (records, total) => {
      setState(prev => ({ ...prev, records, total }));
    });
  }, [layout, cacheVersion]);

  return { ...state, fetching };
}
