import { useCallback, useEffect, useState, useRef } from 'react';

export const getDataAsync = (url: string) => {
  const matchResult = url.match(`_limit=([0-9]+)&_page=([0-9]+)`);
  if (!matchResult) return Promise.reject(new Error('arguments error.'));

  const limitStr = matchResult[1] || '0';
  const pageStr = matchResult[2] || '0';

  const limit = parseFloat(limitStr);

  return new Promise<{ data: string[] }>((resolve) =>
    setTimeout(() => {
      const data = new Array(limit).fill(0).map((_, i) => `Async loaded row #${i + parseFloat(pageStr) * limit}`);

      return resolve({ data });
    }, Math.round(Math.random() * 250))
  );
};

interface InfiniteList<T = any> {
  data: T[];
  error?: string;
  loading: boolean;
  more: boolean;
}

export interface GroupList<TData, TArgs = any> {
  data: TData[];
  parameter: TArgs;
}

export interface FetchListResult<TData, TArgs = any> {
  more: boolean;
  data: GroupList<TData, TArgs>;
}

export const useInfiniteQuery = <TData extends any, TQueryParameter extends any>(
  fetchAction: Func<Promise<FetchListResult<TData, TQueryParameter>>, [arg0: TQueryParameter]>,
  getNextPageParam: Func<
    TQueryParameter,
    [lastGroup: undefined | GroupList<TData, TQueryParameter>, list: GroupList<TData, TQueryParameter>[]]
  >,
  fetchMounted: boolean = true,
  delay: number = 300
) => {
  const [dataSource, setDataSource] = useState<InfiniteList<GroupList<TData, TQueryParameter>>>({
    data: [],
    more: true,
    loading: true,
  });

  const renderingRef = useRef(false);
  useEffect(() => {
    renderingRef.current = false;
  });

  const loadingRef = useRef(false);
  const dataRef = useRef(dataSource.data);
  const handleSetDataSource = useCallback(
    (
      action: Func<
        InfiniteList<GroupList<TData, TQueryParameter>>,
        [previousState: InfiniteList<GroupList<TData, TQueryParameter>>]
      >
    ) => {
      setDataSource((v) => {
        const res = action(v);

        dataRef.current = res.data;
        renderingRef.current = true;
        loadingRef.current = res.loading;

        return res;
      });
    },
    []
  );

  const handleFetchNext = useCallback(() => {
    if (loadingRef.current || renderingRef.current) return;

    const lastGroup = !dataRef.current.length ? undefined : dataRef.current[dataRef.current.length - 1];
    const arg0 = getNextPageParam(lastGroup, dataRef.current);

    const token = setTimeout(() => handleSetDataSource((v) => ({ ...v, loading: true })), delay);
    fetchAction(arg0)
      .finally(() => clearTimeout(token))
      .then(
        ({ data, more }) => {
          handleSetDataSource((v) => ({ ...v, data: [...v.data, data], error: void 0, loading: false, more }));
        },
        (e) => handleSetDataSource((v) => ({ ...v, error: e.m, loading: false }))
      );
  }, [delay, fetchAction, getNextPageParam, handleSetDataSource]);

  useEffect(() => {
    if (fetchMounted) {
      handleFetchNext();
    }
  }, [fetchMounted, handleFetchNext]);

  return {
    data: dataSource.data,
    more: dataSource.more,
    error: dataSource.error,
    loading: dataSource.loading,

    loadingRef,
    dataRef,

    fetchNext: handleFetchNext,
  };
};
