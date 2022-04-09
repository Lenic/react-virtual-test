import type { VirtualItem } from 'react-virtual';
import type { CSSProperties, ReactNode } from 'react';

import type { FetchListResult, GroupList } from './utils';

import memoizeOne from 'memoize-one';
import { useVirtual } from 'react-virtual';
import { Fragment, useCallback, useEffect, useMemo, useState, useRef } from 'react';

import './App.css';

import { useInfiniteQuery, getDataAsync, getColumnCount } from './utils';

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

  const { loading, error, data, more, fetchNext } = useInfiniteQuery(handleFetchList, handleGetNextPageArgs);

  const flatPosts = useMemo(() => (data ? data.map((v) => v.data).flat(1) : []), [data]);

  const parentRef = useRef<HTMLDivElement | null>(null);

  const [columnCount, setColumnCount] = useState(getColumnCount);
  useEffect(() => {
    const observer = new ResizeObserver(([target]) => {
      if (!target) return;

      setColumnCount(getColumnCount(target.contentRect.width));
    });
    observer.observe(document.body);

    return () => observer.disconnect();
  }, []);

  const handleCalcHeight = useCallback(() => 100, []);
  const virtualConfig = useMemo(
    () => ({ size: Math.ceil(flatPosts.length / columnCount), parentRef, estimateSize: handleCalcHeight }),
    [columnCount, flatPosts.length, handleCalcHeight]
  );
  const { virtualItems, totalSize } = useVirtual(virtualConfig);

  const scrollHolder: CSSProperties = useMemo(
    () => ({ height: `${totalSize}px`, width: '100%', position: 'relative' }),
    [totalSize]
  );

  const handleFillItemStyle = useMemo(() => {
    const width = 100 / columnCount;
    const action: Func<CSSProperties, [size: number, start: number, index: number]> = (size, start, index) => ({
      position: 'absolute',
      top: 0,
      left: 0,
      width: `${width}%`,
      height: `${size}px`,
      transform: `translate3d(${100 * index}%, ${start}px, 0px)`,
    });

    return memoizeOne(action);
  }, [columnCount]);

  const prevRatioRef = useRef<number>(0);
  const loadingComponentRef = useRef<HTMLDivElement | null>(null);
  const [scrollContainer, loadingElement] = [parentRef.current, loadingComponentRef.current];
  useEffect(() => {
    if (!scrollContainer || !loadingElement) return;

    const observer = new IntersectionObserver(
      ([target]) => {
        if (!target) return;

        const previousRatio = prevRatioRef.current;
        prevRatioRef.current = target.intersectionRatio;
        if (previousRatio >= target.intersectionRatio) {
          return;
        }

        console.log('target', target);

        fetchNext();
      },
      { root: scrollContainer, rootMargin: '0px 0px 100px 0px' }
    );
    observer.observe(loadingElement);

    return () => observer.disconnect();
  }, [fetchNext, loadingElement, scrollContainer]);

  const handleRenderItem = useCallback(
    ({ index, size, start }: VirtualItem) => {
      const resultList: ReactNode[] = [];

      for (let i = 0; i < columnCount; i++) {
        resultList.push(
          <div
            key={`row-${index}-${i}`}
            className={index % 2 ? 'ListItemOdd' : 'ListItemEven'}
            style={handleFillItemStyle(size, start, i)}
          >
            {flatPosts[index * columnCount + i]}
          </div>
        );
      }

      return <Fragment key={`row-${index}`}>{resultList}</Fragment>;
    },
    [columnCount, flatPosts, handleFillItemStyle]
  );

  return (
    <div ref={parentRef} className="List" style={containerStyle}>
      {!loading ? null : <div>Loading...</div>}
      {!error ? null : <div>Error: {error}</div>}
      <div style={scrollHolder}>{virtualItems.map(handleRenderItem)}</div>
      {!more ? null : (
        <div className="Loading" ref={loadingComponentRef}>
          I'm loading holder.
        </div>
      )}
    </div>
  );
}

export default App;
