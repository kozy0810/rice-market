// Admin APIの1ページ最大件数。orders(first: ...)に渡す値と、
// 安全上限の表示文言の両方で使うため定数化し、ズレないようにする。
export const ORDERS_PAGE_SIZE = 250;

// 1ヶ月分の派遣元別注文がこのページ数で取り切れなかった場合に備えた安全上限
// （無限ループ防止）。超えたら打ち切り、呼び出し側に「不完全」を伝える。
export const MAX_ORDER_PAGES = 20;

export const ORDERS_QUERY = `
  query RoyaltyOrders($query: String!, $cursor: String) {
    orders(first: ${ORDERS_PAGE_SIZE}, after: $cursor, query: $query) {
      nodes {
        id
        name
        currentSubtotalPriceSet {
          shopMoney { amount currencyCode }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

/**
 * 検索クエリに一致する注文を、ページネーションしながら全件取得する。
 * `queryFn`には`shopify.query`と同じ形（(query, {variables}) => Promise<{data, errors}>）を渡す。
 * テストでグローバルの`shopify`に依存させないために引数として受け取る。
 *
 * @param {string} searchQuery
 * @param {(query: string, options: {variables: object}) => Promise<any>} queryFn
 * @returns {Promise<{orders: Array<object>, truncated: boolean}>}
 */
export async function fetchAllFulfilledOrders(searchQuery, queryFn) {
  const orders = [];
  let cursor = null;
  let hasNextPage = true;
  let pageCount = 0;
  let truncated = false;

  while (hasNextPage) {
    if (pageCount >= MAX_ORDER_PAGES) {
      truncated = true;
      break;
    }
    const result = await queryFn(ORDERS_QUERY, {
      variables: {query: searchQuery, cursor},
    });
    if (result.errors) {
      throw new Error(JSON.stringify(result.errors));
    }
    const page = result.data?.orders;
    orders.push(...(page?.nodes ?? []));
    hasNextPage = page?.pageInfo?.hasNextPage ?? false;
    cursor = page?.pageInfo?.endCursor ?? null;
    pageCount += 1;
  }

  return {orders, truncated};
}
