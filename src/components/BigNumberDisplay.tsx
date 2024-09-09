import NumberFormat from "react-number-format";
import { fromDecimals } from "utils";

interface Props {
  value: bigint | number | string;
  decimals?: number | string;
}
function BigNumberDisplay({ value, decimals }: Props) {
  if (decimals) {
    value = fromDecimals(value.toString(), decimals);
  }
  return <NumberFormat displayType="text" value={value.toString()} thousandSeparator={true} />;
}

export default BigNumberDisplay;
