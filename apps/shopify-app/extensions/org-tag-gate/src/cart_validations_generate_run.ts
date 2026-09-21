import type {
  CartValidationsGenerateRunInput,
  CartValidationsGenerateRunResult,
  ValidationError,
} from "../generated/api";

// 購入できるのは「member」タグを持つ顧客だけ。
// 未ログイン、またはタグを失った顧客（卒業者）はチェックアウトを拒否する。
export function cartValidationsGenerateRun(
  input: CartValidationsGenerateRunInput,
): CartValidationsGenerateRunResult {
  const customer = input.cart.buyerIdentity?.customer;
  const errors: ValidationError[] = [];

  if (!customer?.isMember) {
    errors.push({
      message:
        "このストアは登録された技能実習生のみ購入できます。派遣元から配布された登録URLをご確認ください。",
      target: "$.cart",
    });
  }

  return { operations: [{ validationAdd: { errors } }] };
}
