import {describe, test, expect, vi} from 'vitest';
import {fetchAllFulfilledOrders, MAX_ORDER_PAGES} from '../src/fetchOrders.js';

function makePage(orders, hasNextPage, endCursor) {
  return {
    data: {
      orders: {
        nodes: orders,
        pageInfo: {hasNextPage, endCursor},
      },
    },
  };
}

describe('fetchAllFulfilledOrders', () => {
  test('複数ページをカーソルで辿って全件結合する', async () => {
    const page1 = makePage([{id: '1'}, {id: '2'}], true, 'cursor-1');
    const page2 = makePage([{id: '3'}], false, null);
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const {orders, truncated} = await fetchAllFulfilledOrders('tag_prefix:org:', queryFn);

    expect(orders.map((o) => o.id)).toEqual(['1', '2', '3']);
    expect(truncated).toBe(false);
    expect(queryFn).toHaveBeenCalledTimes(2);
    // 2回目の呼び出しは1回目のendCursorを引き継いでいること
    expect(queryFn.mock.calls[1][1].variables.cursor).toBe('cursor-1');
  });

  test('安全上限ページ数に達したら打ち切り、truncated=trueを返す（無限ループ防止）', async () => {
    const queryFn = vi.fn().mockImplementation(() =>
      Promise.resolve(makePage([{id: 'x'}], true, 'always-next')),
    );

    const {orders, truncated} = await fetchAllFulfilledOrders('tag_prefix:org:', queryFn);

    expect(truncated).toBe(true);
    expect(orders.length).toBe(MAX_ORDER_PAGES);
    expect(queryFn).toHaveBeenCalledTimes(MAX_ORDER_PAGES);
  });

  test('0件のときは空配列を返す', async () => {
    const queryFn = vi.fn().mockResolvedValueOnce(makePage([], false, null));

    const {orders, truncated} = await fetchAllFulfilledOrders('tag_prefix:org:', queryFn);

    expect(orders).toEqual([]);
    expect(truncated).toBe(false);
  });

  test('途中のページでerrorsが返ったら例外を投げ、部分結果を黙って返さない', async () => {
    const page1 = makePage([{id: '1'}], true, 'cursor-1');
    const errorPage = {errors: [{message: 'Access denied for orders field.'}]};
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(errorPage);

    await expect(fetchAllFulfilledOrders('tag_prefix:org:', queryFn)).rejects.toThrow();
  });
});
