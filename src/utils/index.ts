import { zeroAddress } from "lib/utils";
import { Address } from "@ton/core";

export const scannerUrl = (isSandbox?: boolean, regularAddress?: boolean) => {
  if (isSandbox) {
    return `https://sandbox.tonwhales.com/explorer/address`;
  }

  if (regularAddress) {
    return `https://tonscan.org/address`;
  }

  return `https://tonscan.org/jetton`;
};

export const getUrlParam = (name: string) => {
  const query = new URLSearchParams(window.location.search);
  return query.get(name);
};

export const isValidAddress = (address: string, errorText?: string) => {
  try {
    const result = Address.parse(address);
    if (result && result.toString() === zeroAddress().toString()) {
      return false;
    }
    return true;
  } catch (error) {
    return false;
  }
};

export function toDecimals(num: number | string, decimals: number | string): bigint {
  const bigIntNum = BigInt(num);
  const bigIntDecimals = 10n ** BigInt(decimals);
  return bigIntNum * bigIntDecimals;
}

export function fromDecimals(num: bigint | number | string, decimals: number | string): string {
  const bigIntNum = BigInt(num);
  const bigIntDecimals = 10n ** BigInt(decimals);
  return (bigIntNum / bigIntDecimals).toString();
}

export const onConnect = () => {
  const container = document.getElementById("ton-connect-button");
  const btn = container?.querySelector("button");

  if (btn) {
    btn.click();
  }
};
