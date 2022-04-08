import type { CSSProperties } from 'react';

import type { FetchListResult, GroupList } from './utils';

import memoizeOne from 'memoize-one';
import { useVirtual } from 'react-virtual';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import './App.css';

import { useInfiniteQuery, getDataAsync } from './utils';

const containerStyle: CSSProperties = {
  height: `500px`,
  width: `100%`,
  overflow: 'auto',
};

function App() {
  const handleFetchList = useCallback(async (nextPage: number) => {
    console.log('handleFetchList', nextPage);
    const { data } = await getDataAsync(`https://demoapi.com?_limit=10&_page=${nextPage}`);
    return {
      more: nextPage < 100,
      data: { data, parameter: nextPage },
    } as FetchListResult<string, number>;
  }, []);

  const handleGetNextPageArgs = useCallback(
    (lastGroup?: GroupList<string, number>) => (lastGroup ? lastGroup.parameter + 10 : 0),
    []
  );

  const { loading, loadingRef, error, data, more, fetchNext } = useInfiniteQuery(
    handleFetchList,
    handleGetNextPageArgs
  );

  const flatPosts = useMemo(() => (data ? data.map((v) => v.data).flat(1) : []), [data]);

  const parentRef = useRef<HTMLDivElement | null>(null);

  const handleCalcHeight = useCallback(() => 100, []);
  const virtualConfig = useMemo(
    () => ({
      size: flatPosts.length,
      parentRef,
      estimateSize: handleCalcHeight,
      paddingEnd: more ? 22 : 0,
    }),
    [flatPosts.length, handleCalcHeight, more]
  );
  const { virtualItems, totalSize } = useVirtual(virtualConfig);

  const scrollHolder: CSSProperties = useMemo(
    () => ({ height: `${totalSize}px`, width: '100%', position: 'relative' }),
    [totalSize]
  );

  const handleFillItemStyle = useMemo(() => {
    const action: Func<CSSProperties, [size: number, start: number]> = (size, start) => ({
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: `${size}px`,
      transform: `translate3d(0px, ${start}px, 0px)`,
    });

    return memoizeOne(action);
  }, []);

  const loadingComponentRef = useRef<HTMLDivElement | null>(null);
  const [scrollContainer, loadingElement] = [parentRef.current, loadingComponentRef.current];
  useEffect(() => {
    if (!scrollContainer || !loadingElement) return;

    const observer = new IntersectionObserver(
      (list) => {
        const [target] = list;
        if (!target) return;
        if (target.time < 1000) return;

        if (!loadingRef.current) {
          fetchNext();
        }
      },
      { root: scrollContainer, rootMargin: '0px 0px 100px 0px' }
    );
    observer.observe(loadingElement);

    return () => observer.disconnect();
  }, [fetchNext, loadingElement, loadingRef, scrollContainer]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <>
      <div ref={parentRef} className="List" style={containerStyle}>
        <div style={scrollHolder}>
          {virtualItems.map((virtualRow) => (
            <div
              key={virtualRow.index}
              className={virtualRow.index % 2 ? 'ListItemOdd' : 'ListItemEven'}
              style={handleFillItemStyle(virtualRow.size, virtualRow.start)}
            >
              {flatPosts[virtualRow.index]}
            </div>
          ))}
        </div>
        {!more ? null : (
          <div className="Loading" ref={loadingComponentRef}>
            I'm loading holder.
          </div>
        )}
      </div>
    </>
  );
}

export default App;
