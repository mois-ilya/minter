import { isValidAddress } from "utils";
import BigNumberDisplay from "components/BigNumberDisplay";

export const validateTransfer = (
  toAddress?: string,
  amount?: bigint,
  balance?: bigint,
  symbol?: string,
  decimals?: string,
): string | undefined | JSX.Element => {
  if (!toAddress) {
    return "Recipient wallet address required";
  }

  if (toAddress && !isValidAddress(toAddress)) {
    return "Invalid Recipient wallet address";
  }

  if (!amount) {
    return "Transfer amount required";
  }

  if (!balance) {
    return "Balance not available";
  }

  if (amount > balance) {
    return (
      <>
        Maximum amount to transfer is <BigNumberDisplay value={balance!!} decimals={decimals} />{" "}
        {symbol}
      </>
    );
  }
};
