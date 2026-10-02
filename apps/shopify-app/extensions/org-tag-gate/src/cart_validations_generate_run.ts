import type {
  CartValidationsGenerateRunInput,
  CartValidationsGenerateRunResult,
  LanguageCode,
  ValidationError,
} from "../generated/api";

// ValidationError.message はストア側で自動翻訳されないため、
// input.localization.language を見て自前でメッセージを出し分ける。
const NOT_MEMBER_MESSAGE: Partial<Record<LanguageCode, string>> = {
  JA: "このストアは登録された特定の会員様のみ購入できます。派遣元から配布された登録URLをご確認ください。",
  EN: "This store is only available to registered members. Please check the registration URL provided by your dispatch organization.",
  VI: "Cửa hàng này chỉ dành cho hội viên đã đăng ký. Vui lòng kiểm tra URL đăng ký do tổ chức phái cử của bạn cung cấp.",
  ZH_CN: "本店铺仅限已注册会员购买。请确认您所属机构提供的注册链接。",
  ZH_TW: "本店鋪僅限已註冊會員購買。請確認您所屬機構提供的註冊連結。",
};

// 購入できるのは「member」タグを持つ顧客だけ。
// 未ログイン、またはタグを失った顧客（卒業者）はチェックアウトを拒否する。
export function cartValidationsGenerateRun(
  input: CartValidationsGenerateRunInput,
): CartValidationsGenerateRunResult {
  const customer = input.cart.buyerIdentity?.customer;
  const errors: ValidationError[] = [];

  if (!customer?.isMember) {
    const language = input.localization.language.isoCode;
    errors.push({
      message: NOT_MEMBER_MESSAGE[language] ?? NOT_MEMBER_MESSAGE.JA!,
      target: "$.cart",
    });
  }

  return { operations: [{ validationAdd: { errors } }] };
}
