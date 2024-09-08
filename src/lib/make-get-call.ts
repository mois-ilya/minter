import { Address, Cell } from "@ton/core";
import { TonClient, TupleItem, TupleReader } from "@ton/ton";

function _prepareParam(param: Cell | bigint): TupleItem {
  if (param instanceof Cell) {
    return {
      type: "slice",
      cell: param,
    };
  } else if (typeof param === "bigint") {
    return {
      type: "int",
      value: param,
    };
  }

  throw new Error("unknown type!");
}

export type GetResponseValue = Cell | bigint | null;

export function cellToAddress(s: GetResponseValue): Address {
  return (s as Cell).beginParse().loadAddress();
}

export async function makeGetCall(
  address: Address,
  method: string,
  param: Cell | bigint | null,
  tonClient: TonClient,
): Promise<TupleReader> {
  const params = param === null ? [] : [_prepareParam(param)];
  const { stack } = await tonClient.callGetMethod(address, method, params);

  return stack;
}
