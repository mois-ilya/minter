import { Address, Cell, StateInit, beginCell, contractAddress, storeStateInit } from "@ton/core";
import { SendTransactionRequest, TonConnectUI } from "@tonconnect/ui-react";

interface ContractDeployDetails {
  deployer: Address;
  value: bigint;
  code: Cell;
  data: Cell;
  message?: Cell;
  dryRun?: boolean;
}

export class ContractDeployer {
  addressForContract(params: ContractDeployDetails) {
    const workchain = 0;
    const stateInit = {
      data: params.data,
    };

    return contractAddress(workchain, stateInit);
  }

  async deployContract(
    params: ContractDeployDetails,
    tonConnection: TonConnectUI,
  ): Promise<Address> {
    const stateInit: StateInit = {
      data: params.data,
      code: params.code,
    };

    const stateInitBuilder = beginCell();
    storeStateInit(stateInit)(stateInitBuilder);
    const cell = stateInitBuilder.endCell();

    console.log("Cell hash", cell.hash().toString("base64"));
    console.log("Cell gIleIfiSXOBjrReiC5uAvOJuskqTlCaYZBaXo4/df84=");

    // throw new Error("stop");

    const _contractAddress = this.addressForContract(params);
    if (!params.dryRun) {
      const tx: SendTransactionRequest = {
        validUntil: Date.now() + 5 * 60 * 1000,
        messages: [
          {
            address: _contractAddress.toString(),
            amount: params.value.toString(),
            stateInit: cell.toBoc().toString("base64"),
            payload: params.message?.toBoc().toString("base64"),
          },
        ],
      };

      await tonConnection.sendTransaction(tx);
    }

    return _contractAddress;
  }
}
