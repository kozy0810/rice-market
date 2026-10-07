import {useState, useEffect, useMemo} from 'preact/hooks';
import {aggregateOrdersByOrg} from '../aggregate.js';
import {buildAllOrgsOrdersSearchQuery, isMonthOutsideDefaultOrderWindow} from '../searchQuery.js';
import {fetchAllFulfilledOrders, ORDERS_PAGE_SIZE, MAX_ORDER_PAGES} from '../fetchOrders.js';

// shopify.app.toml の [metaobjects.app.dispatch_org] の name と一致させる。
// GraphQL上のtypeは "app--<アプリのクライアントID>--dispatch_org" のようにストアへの
// インストールごとに変わる値になるため、ハードコードせずnameで定義を検索して解決する。
const DISPATCH_ORG_DEFINITION_NAME = '派遣元組織';

const DISPATCH_ORG_DEFINITION_QUERY = `
  query RoyaltyDispatchOrgDefinition {
    metaobjectDefinitions(first: 50) {
      nodes { type name }
    }
  }
`;

const DISPATCH_ORGS_QUERY = `
  query RoyaltyDispatchOrgs($type: String!) {
    metaobjects(type: $type, first: 50) {
      nodes {
        handle
        fields { key value }
      }
    }
  }
`;

const MONTH_OPTIONS = Array.from({length: 12}, (_, i) => i + 1);

function currentYearMonth() {
  const now = new Date();
  return {year: now.getFullYear(), month: now.getMonth() + 1};
}

function yearOptions(currentYear) {
  return [currentYear - 1, currentYear, currentYear + 1];
}

// 派遣元名の表示解決にだけ使う（画面上の集計条件からは派遣元の指定自体を無くした）。
// マスタ未登録の組織はコードのままテーブルに表示する。
async function loadDispatchOrgNames() {
  const defResult = await shopify.query(DISPATCH_ORG_DEFINITION_QUERY);
  if (defResult.errors) {
    throw new Error(JSON.stringify(defResult.errors));
  }
  const definition = (defResult.data?.metaobjectDefinitions?.nodes ?? []).find(
    (node) => node.name === DISPATCH_ORG_DEFINITION_NAME,
  );
  // 定義がまだ無いストア（構築直後など）では、コード表示のまま運用する。
  if (!definition) {
    return {};
  }

  const listResult = await shopify.query(DISPATCH_ORGS_QUERY, {
    variables: {type: definition.type},
  });
  if (listResult.errors) {
    throw new Error(JSON.stringify(listResult.errors));
  }
  const nameByOrgCode = {};
  for (const node of listResult.data?.metaobjects?.nodes ?? []) {
    const fields = Object.fromEntries(node.fields.map((f) => [f.key, f.value]));
    if (fields.org_code) {
      nameByOrgCode[fields.org_code] = fields.org_name ?? fields.org_code;
    }
  }
  return nameByOrgCode;
}

export default function HomePage() {
  const {year: defaultYear, month: defaultMonth} = useMemo(currentYearMonth, []);

  const [orgNames, setOrgNames] = useState({}); // {orgCode: orgName}

  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [royaltyRatePercent, setRoyaltyRatePercent] = useState('1.5');

  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [errorMessage, setErrorMessage] = useState(null);
  const [result, setResult] = useState(null); // {rows, truncated}

  useEffect(() => {
    loadDispatchOrgNames().then(setOrgNames).catch(() => {
      // 派遣元名が引けなくても、集計結果はコード表示にフォールバックして出し続ける。
      // 集計機能自体を止めるほどの失敗ではないため、エラーバナーは出さない。
    });
  }, []);

  async function handleAggregate() {
    setResult(null);
    setErrorMessage(null);
    setStatus('loading');
    try {
      const searchQuery = buildAllOrgsOrdersSearchQuery({year, month});
      const {orders, truncated} = await fetchAllFulfilledOrders(searchQuery, (query, options) =>
        shopify.query(query, options),
      );
      const rows = aggregateOrdersByOrg(orders, royaltyRatePercent);
      setResult({rows, truncated});
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setErrorMessage(String(err?.message ?? err));
    }
  }

  const monthMayBeOutsideOrderWindow = isMonthOutsideDefaultOrderWindow({year, month});
  const totalRoyaltyYen = result?.rows.reduce((sum, row) => sum + row.royaltyAmountYen, 0) ?? 0;

  return (
    <s-page heading="Royalty Calculator">
      <s-section heading="集計条件">
        {monthMayBeOutsideOrderWindow && (
          <s-banner tone="warning">
            <s-paragraph>
              選択した月は、デフォルトでアクセスできる直近60日の範囲外になっている可能性があります。
              read_all_ordersスコープが未承認の間は、この月を集計すると結果が0件または不完全になることがあります。
            </s-paragraph>
          </s-banner>
        )}
        <s-stack gap="base">
          <s-select label="年" value={String(year)} onChange={(e) => setYear(Number(e.currentTarget.value))}>
            {yearOptions(defaultYear).map((y) => (
              <s-option key={y} value={String(y)}>
                {y}年
              </s-option>
            ))}
          </s-select>

          <s-select label="月" value={String(month)} onChange={(e) => setMonth(Number(e.currentTarget.value))}>
            {MONTH_OPTIONS.map((m) => (
              <s-option key={m} value={String(m)}>
                {m}月
              </s-option>
            ))}
          </s-select>

          <s-number-field
            label="ロイヤリティ率（%）"
            details="例: 1.5 と入力すると 1.5% として計算します"
            suffix="%"
            step="0.01"
            min="0"
            value={royaltyRatePercent}
            onChange={(e) => setRoyaltyRatePercent(e.currentTarget.value)}
          />

          <s-button variant="primary" onClick={handleAggregate} disabled={status === 'loading'}>
            {status === 'loading' ? '集計中...' : '集計する'}
          </s-button>
        </s-stack>
      </s-section>

      {status === 'error' && (
        <s-section heading="エラー">
          <s-banner tone="critical">
            <s-paragraph>{errorMessage}</s-paragraph>
          </s-banner>
        </s-section>
      )}

      {status === 'done' && result && (
        <s-section heading={`${year}年${month}月の集計結果`}>
          {result.truncated && (
            <s-banner tone="warning">
              <s-paragraph>
                注文件数が上限（{MAX_ORDER_PAGES * ORDERS_PAGE_SIZE}件相当）に達したため、集計が対象期間の一部のみになっている可能性があります。
              </s-paragraph>
            </s-banner>
          )}

          {result.rows.length === 0 ? (
            <s-paragraph>対象の発送済み注文は見つかりませんでした。</s-paragraph>
          ) : (
            <>
              <s-paragraph>
                {result.rows.length}件の派遣元 ・ 合計ロイヤリティ額{' '}
                <s-text type="strong">{totalRoyaltyYen.toLocaleString('ja-JP')}円</s-text>（率 {royaltyRatePercent}%）
              </s-paragraph>
              <s-table>
                <s-table-header-row>
                  <s-table-header>派遣元</s-table-header>
                  <s-table-header>注文件数</s-table-header>
                  <s-table-header>合計売上</s-table-header>
                  <s-table-header>ロイヤリティ額</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {result.rows.map((row) => (
                    <s-table-row key={row.orgCode}>
                      <s-table-cell>{orgNames[row.orgCode] ?? row.orgCode}</s-table-cell>
                      <s-table-cell>{row.orderCount}件</s-table-cell>
                      <s-table-cell>{row.totalRevenueYen.toLocaleString('ja-JP')}円</s-table-cell>
                      <s-table-cell>
                        <s-badge tone="success">{row.royaltyAmountYen.toLocaleString('ja-JP')}円</s-badge>
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            </>
          )}
        </s-section>
      )}
    </s-page>
  );
}
