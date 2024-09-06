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

/**
 * This function is based on the `toNano` function from the TON Core project.
 * The original function can be found at the following link:
 * https://github.com/ton-org/ton-core/blob/3a68441b615f5fa817106c7f4d9586656a9f81b4/src/utils/convert.ts#L9
 *
 * Unlike `toNano`, this function is designed to convert numeric values with arbitrary precision
 */
export function toDecimals(src: number | string, decimals: number | string): bigint {
  const bigIntDecimals = 10n ** BigInt(decimals);

  if (typeof src === "bigint") {
    return src * bigIntDecimals;
  } else {
    if (typeof src === "number") {
      if (!Number.isFinite(src)) {
        throw Error("Invalid number");
      }

      if (Math.log10(src) <= 6) {
        src = src.toLocaleString("en", { minimumFractionDigits: 9, useGrouping: false });
      } else if (src - Math.trunc(src) === 0) {
        src = src.toLocaleString("en", { maximumFractionDigits: 0, useGrouping: false });
      } else {
        throw Error("Not enough precision for a number value. Use string value instead");
      }
    }

    // Check sign
    let neg = false;
    while (src.startsWith("-")) {
      neg = !neg;
      src = src.slice(1);
    }

    // Split string
    if (src === ".") {
      throw Error("Invalid number");
    }
    let parts = src.split(".");
    if (parts.length > 2) {
      throw Error("Invalid number");
    }

    // Prepare parts
    let whole = parts[0];
    let frac = parts[1];
    if (!whole) {
      whole = "0";
    }
    if (!frac) {
      frac = "0";
    }
    if (frac.length > 9) {
      throw Error("Invalid number");
    }
    while (frac.length < 9) {
      frac += "0";
    }

    // Convert
    let r = BigInt(whole) * bigIntDecimals + BigInt(frac);
    if (neg) {
      r = -r;
    }
    return r;
  }
}

export function fromDecimals(num: bigint | number | string, decimals: number | string): string {
  const dec = Number(decimals);
  const strNum = BigInt(num)
    .toString()
    .padStart(dec + 1, "0");

  const intPart = strNum.slice(0, -dec);
  const fracPart = strNum.slice(-dec).replace(/0+$/, "");

  return [intPart, fracPart].filter(Boolean).join(".");
}

export const onConnect = () => {
  const container = document.getElementById("ton-connect-button");
  const btn = container?.querySelector("button");

  if (btn) {
    btn.click();
  }
};
