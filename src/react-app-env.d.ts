/// <reference types="react-scripts" />

declare interface Func<TResult, TArgs extends any[] = []> {
  (...args: TArgs): TResult;
}

declare type Action<TArgs extends any[] = []> = Func<void, TArgs>;
