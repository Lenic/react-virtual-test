import type { VirtualItem } from 'react-virtual';
import type { CSSProperties, ReactNode } from 'react';

import type { FetchListResult, GroupList } from './utils';

import Deferred from '@lenic/deferred';
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
    const { data } = await getDataAsync(`https://demoapi.com?_limit=60&_page=${nextPage}`);
    return {
      more: nextPage < 100,
      data: { data, parameter: nextPage },
    } as FetchListResult<string, number>;
  }, []);

  const handleGetNextPageArgs = useCallback(
    (lastGroup?: GroupList<string, number>) => (lastGroup ? lastGroup.parameter + 60 : 0),
    []
  );

  const { loading, error, data, more, fetchNext } = useInfiniteQuery(handleFetchList, handleGetNextPageArgs);

  const flatPosts = useMemo(() => (data ? data.map((v) => v.data).flat(1) : []), [data]);

  const parentRef = useRef<HTMLDivElement | null>(null);

  const handleCalcHeight = useCallback(() => 100, []);
  const [columnCount, setColumnCount] = useState(getColumnCount);
  const scrollToFn: (offset: number, defaultScrollToFn?: (offset: number) => void) => void = useCallback(
    (offset, defaultScrollTo) => {
      console.log('scrollTo', offset);
      defaultScrollTo?.(offset);
    },
    []
  );
  const virtualConfig = useMemo(
    () => ({
      size: Math.ceil(flatPosts.length / columnCount),
      parentRef,
      estimateSize: handleCalcHeight,
      scrollToFn,
      overscan: 0,
    }),
    [columnCount, flatPosts.length, handleCalcHeight, scrollToFn]
  );
  const { virtualItems, totalSize, scrollToIndex } = useVirtual(virtualConfig);

  const leftTopIndexRef = useRef(0);
  useEffect(() => {
    leftTopIndexRef.current = virtualItems.length ? virtualItems[0].index : 0;

    console.log('top index', leftTopIndexRef.current);
  }, [virtualItems]);

  const deferRef = useRef<Deferred<Action>>();
  const cachedLeftTopIndexRef = useRef(-1);
  useEffect(() => {
    if (cachedLeftTopIndexRef.current !== -1 && deferRef.current) {
      deferRef.current.resolve(() => {
        console.log('set left top', cachedLeftTopIndexRef.current);
        scrollToIndex(cachedLeftTopIndexRef.current, { align: 'start' });
        cachedLeftTopIndexRef.current = -1;
      });
    }
  });

  useEffect(() => {
    const observer = new ResizeObserver(([target]) => {
      if (!target) return;

      setColumnCount((previousColumnCount) => {
        const currentColumnCount = getColumnCount(target.contentRect.width);

        if (previousColumnCount !== currentColumnCount) {
          const defer = new Deferred<Action>();
          defer.promise.then((action) => {
            deferRef.current = void 0;

            action();
          });
          deferRef.current = defer;

          if (cachedLeftTopIndexRef.current === -1) {
            const leftTopIndexForNow = previousColumnCount * leftTopIndexRef.current;
            const leftTopIndexForNextOnlyColumnOne = Math.floor(leftTopIndexForNow / currentColumnCount);
            cachedLeftTopIndexRef.current = leftTopIndexForNextOnlyColumnOne;
          }
        }

        return currentColumnCount;
      });
    });
    observer.observe(document.body);

    return () => observer.disconnect();
  }, []);

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

        /**
         * 只有向上滚动时才触发获取更多数据
         */
        const previousRatio = prevRatioRef.current;
        prevRatioRef.current = target.intersectionRatio;
        if (previousRatio >= target.intersectionRatio) {
          return;
        }

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

  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input name="" type="text" ref={inputRef} />
      <button
        onClick={() => {
          const index = parseInt(inputRef.current?.value || '0', 10);
          debugger;
          scrollToIndex(index, { align: 'start' });
        }}
      >
        scrollToIndex
      </button>
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
    </>
  );
}

export default App;
