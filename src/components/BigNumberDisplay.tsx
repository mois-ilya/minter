import NumberFormat from "react-number-format";
import { toDecimals } from "utils";

interface Props {
  value: bigint | number | string;
  decimals?: number | string;
}
function BigNumberDisplay({ value, decimals }: Props) {
  if (decimals) {
    value = toDecimals(value.toString(), decimals);
  }
  return <NumberFormat displayType="text" value={value.toString()} thousandSeparator={true} />;
}

export default BigNumberDisplay;
