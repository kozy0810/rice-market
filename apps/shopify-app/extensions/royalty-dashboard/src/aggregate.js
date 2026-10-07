import {isValidOrgCode} from './searchQuery.js';

// Shopifyの金額は文字列（例 "700.0"）で返る。parseFloatで合算すると
// 浮動小数点誤差が蓄積しうるため、文字列のまま整数化してから整数同士で合算する。
//
// 注意: BigIntは使わない。このApp Home UI Extensionのビルドターゲットは
// esbuildの出力上 "es2015" になっており、BigIntリテラル（0nなど）を含めると
// ビルドは警告付きで成功するものの、実機（shopify app devのプレビュー）では
// 拡張機能が画面に一切描画されなくなることをDevストアで確認した
// （BigIntリテラル構文がそもそも実行環境でパースできていないと見られる）。
// そのため、安全圏に収まる桁数のNumber整数演算で代替する。

// 金額文字列を「1円 = SCALE」単位の整数に変換するための小数桁数。
// Shopifyのshopmoney amountは通常小数点以下2桁までなので2桁で十分。
const SCALE_DIGITS = 2;
const SCALE = 10 ** SCALE_DIGITS;

/**
 * 金額文字列（例 "700.0", "-1234.56"）を SCALE 倍した整数に変換する。
 * 小数点以下が SCALE_DIGITS 桁を超える場合は切り捨てる。
 */
function parseAmountToScaled(amountString) {
  const str = String(amountString).trim();
  const negative = str.startsWith('-');
  const unsigned = negative ? str.slice(1) : str;
  const [intPart = '0', fracPartRaw = ''] = unsigned.split('.');
  const fracPart = (fracPartRaw + '0'.repeat(SCALE_DIGITS)).slice(0, SCALE_DIGITS);
  const scaled = Number(intPart || '0') * SCALE + Number(fracPart || '0');
  return negative ? -scaled : scaled;
}

/**
 * SCALE倍された整数を、四捨五入（0.5は切り上げ）で円単位の整数に戻す。
 */
function scaledToRoundedYen(scaled) {
  return Math.round(scaled / SCALE);
}

/**
 * ロイヤリティ率の入力値（例 "1.5" = 1.5%）を受け取り、注文一覧から
 * 「対象注文数・合計売上（円）・ロイヤリティ額（円）」を算出する。
 *
 * @param {Array<{name?: string, currentSubtotalPriceSet?: {shopMoney?: {amount?: string, currencyCode?: string}}}>} orders
 * @param {string|number} royaltyRatePercent 例: 1.5 は 1.5% を意味する
 * @returns {{orderCount: number, totalRevenueYen: number, royaltyAmountYen: number, currencyCode: string|null}}
 */
export function aggregateOrders(orders, royaltyRatePercent) {
  const list = Array.isArray(orders) ? orders : [];

  let totalScaled = 0;
  let currencyCode = null;
  for (const order of list) {
    const shopMoney = order?.currentSubtotalPriceSet?.shopMoney;
    totalScaled += parseAmountToScaled(shopMoney?.amount ?? '0');
    // 複数通貨が混在する運用は想定していないため、最初に見つかった通貨コードを表示用に使う。
    if (!currencyCode && shopMoney?.currencyCode) {
      currencyCode = shopMoney.currencyCode;
    }
  }

  // 率も同じSCALEで整数化してから掛け、最後に 100 * SCALE で割って
  // 「SCALE倍された円」に戻す。割り算は最後に一度だけ行うため、
  // 事業規模（総額が数十億円を超えない想定）では誤差は無視できる。
  //
  // 注意: ここのMath.roundは、小計がすべて整数円（Shopifyのshopmoney amountが
  // "xxx.0"のみ）である限りは常に割り切れるため実質no-opで、最終的な丸めは
  // scaledToRoundedYen側の1回だけになる。小数円（セント相当）を持つ通貨を
  // 扱うようになった場合はここでも丸めが発生し、二重丸めにより境界値
  // （例: 1049.50円 × 1% のような厳密に0.5の値）の結果がズレうる。
  const rateScaled = parseAmountToScaled(royaltyRatePercent ?? '0');
  const royaltyScaled = Math.round((totalScaled * rateScaled) / (100 * SCALE));

  return {
    orderCount: list.length,
    totalRevenueYen: scaledToRoundedYen(totalScaled),
    royaltyAmountYen: scaledToRoundedYen(royaltyScaled),
    currencyCode,
  };
}

/**
 * 注文のタグ配列から "org:" で始まるタグを探し、派遣元コードを取り出す。
 * 見つからない、または org_code として不正な形式（半角英数字とハイフン以外を含む）
 * の場合は null を返し、呼び出し側で集計対象から除外する。
 */
function extractOrgCode(tags) {
  const tag = (Array.isArray(tags) ? tags : []).find((t) => typeof t === 'string' && t.startsWith('org:'));
  if (!tag) {
    return null;
  }
  const orgCode = tag.slice('org:'.length);
  return isValidOrgCode(orgCode) ? orgCode : null;
}

/**
 * 注文一覧を派遣元(org:タグ)ごとにグルーピングし、それぞれについて
 * aggregateOrders と同じ内訳(対象注文数・合計売上・ロイヤリティ額)を算出する。
 * 表示上の「見やすさ」のため、ロイヤリティ額が大きい順（同額ならorgCode順）に並べる。
 *
 * @param {Array<object>} orders
 * @param {string|number} royaltyRatePercent
 * @returns {Array<{orgCode: string, orderCount: number, totalRevenueYen: number, royaltyAmountYen: number, currencyCode: string|null}>}
 */
export function aggregateOrdersByOrg(orders, royaltyRatePercent) {
  const list = Array.isArray(orders) ? orders : [];

  const ordersByOrgCode = new Map();
  for (const order of list) {
    const orgCode = extractOrgCode(order?.tags);
    if (!orgCode) {
      continue;
    }
    if (!ordersByOrgCode.has(orgCode)) {
      ordersByOrgCode.set(orgCode, []);
    }
    ordersByOrgCode.get(orgCode).push(order);
  }

  const rows = Array.from(ordersByOrgCode.entries()).map(([orgCode, orgOrders]) => ({
    orgCode,
    ...aggregateOrders(orgOrders, royaltyRatePercent),
  }));

  rows.sort((a, b) => b.royaltyAmountYen - a.royaltyAmountYen || a.orgCode.localeCompare(b.orgCode));
  return rows;
}
