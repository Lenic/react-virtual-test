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
    }, Math.round(Math.random() * 2500))
  );
};

/**
 * 内部使用的无限滚动数据结构
 */
interface InfiniteList<T = any> {
  /**
   * 从 Ajax 中拿到的所有数据
   */
  data: T[];
  /**
   * 请求 Ajax 过程中是否存在异常
   *
   * - 只与最近一次的 Ajax 请求相关
   * - 再次发送 Ajax 没有发生异常，此值将被清空
   */
  error?: string;
  /**
   * 指示 Ajax 的请求状态
   *
   * - 请求中时此值为 `true`
   * - Ajax 请求发出后，`delay` 毫秒后此值才为 `true`
   *   - 有一定的延迟
   *   - 根据事件循环的原理，`delay` 毫秒的值不一定精确
   */
  loading: boolean;
  /**
   * 是否还应该发送 Ajax 请求获取新数据
   *
   * - 根据 Ajax 请求得到的值设置
   */
  more: boolean;
}

/**
 * 获取得到的新数据
 */
export interface GroupList<TData, TArgs = any> {
  /**
   * 新数据的数组
   */
  data: TData[];
  /**
   * 获取 `data` 数据时 Ajax 的参数信息
   */
  parameter: TArgs;
}

/**
 * 获取新数据的结果
 */
export interface FetchListResult<TData, TArgs = any> {
  /**
   * 只是是否能再次发送 Ajax 获取新数据
   */
  more: boolean;
  /**
   * 获取得到的新数据
   */
  data: GroupList<TData, TArgs>;
}

/**
 * 封装了无限滚动的自定义逻辑
 * @param fetchAction {Func<Promise<FetchListResult<TData, TQueryParameter>>, [arg0: TQueryParameter]>} 获取新数据的回调方法
 * @param getNextPageParam {Func<TQueryParameter, [lastGroup: undefined | GroupList<TData, TQueryParameter>, list: GroupList<TData, TQueryParameter>[]]>} 发送获取新数据请求前，根据已有数据组装下一次请求参数的回调方法
 * @param delay {number} 请求新数据的 Ajax 发送后，到设置 `loading` 指示为 `true` 的时间间隔，这个值防止出现 Loading 动画的闪烁现象，默认值为 `300ms`
 */
export const useInfiniteQuery = <TData extends any, TQueryParameter extends any>(
  fetchAction: Func<Promise<FetchListResult<TData, TQueryParameter>>, [arg0: TQueryParameter]>,
  getNextPageParam: Func<
    TQueryParameter,
    [lastGroup: undefined | GroupList<TData, TQueryParameter>, list: GroupList<TData, TQueryParameter>[]]
  >,
  delay: number = 300
) => {
  /**
   * 用于保存历次请求获取到的数据
   */
  const [dataSource, setDataSource] = useState<InfiniteList<GroupList<TData, TQueryParameter>>>({
    data: [],
    more: true,
    loading: true,
  });

  /**
   * 指示当前时是否处于『拿到新数据但是还没有渲染到 DOM 上』阶段
   *
   * - 默认值 `false` 表示不是处于这个阶段
   * - 这个阶段的定义是：
   *   - 已经获取到新数据
   *   - 执行了 `setDataSource` 方法
   *   - 新数据还没有 `render` 到 DOM 上
   * - 处于阶段时，值才为 `true`
   * - 处于这个阶段时，不能进行新的数据请求
   */
  const renderingRef = useRef(false);

  /**
   * 设置每次渲染完成后设置『拿到新数据但是还没有渲染到 DOM 上』的值为 `false`
   */
  useEffect(() => {
    renderingRef.current = false;
  });

  /**
   * 表示当前是否处于请求 Ajax 阶段
   *
   * - 只在内部使用
   * - 和 `dataSource.loading` 设置为 `false` 的时机相同
   * - 没有根据 `delay` 设定，在 Ajax 请求发出 `delay` 毫秒后才设置为 `true`，而是在 Ajax 发出前就设定为 `false`
   */
  const loadingRef = useRef(false);

  /**
   * 与 `dataSource.data` 的值始终保持相同
   *
   * - 在调用 `setDataSource` 方法后，新数据还没有 `render` 到 DOM 之前，与 `dataSource.data` 不同
   */
  const dataRef = useRef(dataSource.data);

  /**
   * 对 `setDataSource` 方法的封装
   *
   * - 在调用 `setDataSource` 时，还额外更新了一些 `Ref` 引用数据
   *   - `dataRef`：保持与 `dataSource.data` 的值引用相同，在某些时机下不同
   *   - `renderingRef`：变更了 `dataSource` 的值，还没有渲染到 DOM 上之前，此值保持为 `true`
   *   - `loadingRef`：与 `dataSource.loading` 的值，保持等于 `false` 时一致，等于 `true` 时有可能不一致
   */
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

  /**
   * 暴露给外部使用的获取新数据的方法：调用就发送 Ajax 请求新数据
   *
   * - 在 `loadingRef` 指示为『加载中』时，不发送 Ajax 请求新数据
   * - 在 `renderingRef` 指示为『新数据还没有渲染完成』时，不发送 Ajax 请求新数据
   * - 发送 Ajax 请求前，会直接设置 `loadingRef` 的值为 `true`，此时距离设置 `dataSource.loading === true` 还有 `delay` 毫秒的时间
   */
  const handleFetchNext = useCallback(() => {
    if (loadingRef.current || renderingRef.current) return;

    loadingRef.current = true;

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

  return {
    data: dataSource.data,
    more: dataSource.more,
    error: dataSource.error,
    loading: dataSource.loading,

    dataRef,

    fetchNext: handleFetchNext,
  };
};

export const getColumnCount = (width?: number) => {
  let currentWidth = width;
  if (!currentWidth) {
    currentWidth = window.innerWidth;
  }

  if (currentWidth <= 300) return 1;

  if (currentWidth <= 500) return 2;

  if (currentWidth <= 700) return 3;

  if (currentWidth <= 900) return 4;

  return 5;
};
