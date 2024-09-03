import { Address, Cell } from "@ton/core";
import { TonClient, TupleItem, TupleItemSlice, TupleReader } from "@ton/ton";

function _prepareParams(params: Cell[] = []): TupleItemSlice[] {
  return params.map((p) => {
    if (p instanceof Cell) {
      //TODO Left this check as a precaution, unclear why it was needed before. Need check
      return {
        type: "slice",
        cell: p,
      };
    }

    throw new Error("unknown type!");
  });
}

export type GetResponseValue = Cell | bigint | null;

export function cellToAddress(s: GetResponseValue): Address {
  return (s as Cell).beginParse().loadAddress();
}

export async function makeGetCall<T>(address: Address, params: Cell, tonClient: TonClient) {
  const { stack } = await tonClient.callGetMethod(
    address,
    "get_wallet_address",
    _prepareParams([params]),
  );

  return stack.readAddress();
}
