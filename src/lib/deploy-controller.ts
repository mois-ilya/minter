import { Address, beginCell, toNano } from "@ton/ton";
import { ContractDeployer } from "./contract-deployer";

import { createDeployParams, waitForContractDeploy, waitForSeqno } from "./utils";
import { zeroAddress } from "./utils";
import {
  buildJettonOnchainMetadata,
  burn,
  mintBody,
  readJettonMetadata,
  transfer,
  updateMetadataBody,
} from "./jetton-minter";
import { changeAdminBody, JettonMetaDataKeys } from "./jetton-minter";
import { getClient } from "./get-ton-client";
import { makeGetCall } from "./make-get-call";
import { SendTransactionRequest, TonConnectUI } from "@tonconnect/ui-react";

export const JETTON_DEPLOY_GAS = toNano(0.25);

export enum JettonDeployState {
  NOT_STARTED,
  BALANCE_CHECK,
  UPLOAD_IMAGE,
  UPLOAD_METADATA,
  AWAITING_MINTER_DEPLOY,
  AWAITING_JWALLET_DEPLOY,
  VERIFY_MINT,
  ALREADY_DEPLOYED,
  DONE,
}

export interface JettonDeployParams {
  onchainMetaData?: {
    name: string;
    symbol: string;
    description?: string;
    image?: string;
    decimals?: string;
  };
  offchainUri?: string;
  owner: Address;
  amountToMint: bigint;
}

class JettonDeployController {
  async createJetton(params: JettonDeployParams, tonConnection: TonConnectUI): Promise<Address> {
    const contractDeployer = new ContractDeployer();
    const tc = await getClient();
    const balance = await tc.getBalance(params.owner);

    if (balance < JETTON_DEPLOY_GAS) throw new Error("Not enough balance in deployer wallet");

    const deployParams = createDeployParams(params, params.offchainUri);
    const contractAddr = contractDeployer.addressForContract(deployParams);

    const isDeployed = await tc.isContractDeployed(contractAddr);
    if (!isDeployed) {
      await contractDeployer.deployContract(deployParams, tonConnection);
      await waitForContractDeploy(contractAddr, tc);
    }

    const cellForOwner = beginCell().storeAddress(params.owner).endCell();

    const ownerJWalletAddr = await makeGetCall(
      contractAddr,
      "get_wallet_address",
      cellForOwner,
      tc,
    ).then((v) => v.readAddress());

    await waitForContractDeploy(ownerJWalletAddr, tc);

    return contractAddr;
  }

  async burnAdmin(contractAddress: Address, tonConnection: TonConnectUI, walletAddress: string) {
    const waiter = await waitForSeqno(walletAddress);

    const tx: SendTransactionRequest = {
      validUntil: Date.now() + 5 * 60 * 1000,
      messages: [
        {
          address: contractAddress.toString(),
          amount: toNano(0.01).toString(),
          stateInit: undefined,
          payload: changeAdminBody(zeroAddress()).toBoc().toString("base64"),
        },
      ],
    };

    await tonConnection.sendTransaction(tx);
    await waiter();
  }

  async mint(
    tonConnection: TonConnectUI,
    jettonMaster: Address,
    amount: bigint,
    walletAddress: string,
  ) {
    const waiter = await waitForSeqno(walletAddress);

    const tx: SendTransactionRequest = {
      validUntil: Date.now() + 5 * 60 * 1000,
      messages: [
        {
          address: jettonMaster.toString(),
          amount: toNano(0.04).toString(),
          stateInit: undefined,
          payload: mintBody(Address.parse(walletAddress), amount, toNano(0.02), 0)
            .toBoc()
            .toString("base64"),
        },
      ],
    };

    await tonConnection.sendTransaction(tx);
    await waiter();
  }

  async transfer(
    tonConnection: TonConnectUI,
    amount: bigint,
    toAddress: string,
    fromAddress: string,
    ownerJettonWallet: string,
  ) {
    const waiter = await waitForSeqno(fromAddress);

    const tx: SendTransactionRequest = {
      validUntil: Date.now() + 5 * 60 * 1000,
      messages: [
        {
          address: ownerJettonWallet,
          amount: toNano(0.05).toString(),
          stateInit: undefined,
          payload: transfer(Address.parse(toAddress), Address.parse(fromAddress), amount)
            .toBoc()
            .toString("base64"),
        },
      ],
    };

    await tonConnection.sendTransaction(tx);

    await waiter();
  }

  async burnJettons(
    tonConnection: TonConnectUI,
    amount: bigint,
    jettonAddress: string,
    walletAddress: string,
  ) {
    const waiter = await waitForSeqno(walletAddress);

    const tx: SendTransactionRequest = {
      validUntil: Date.now() + 5 * 60 * 1000,
      messages: [
        {
          address: jettonAddress,
          amount: toNano(0.031).toString(),
          stateInit: undefined,
          payload: burn(amount, Address.parse(walletAddress)).toBoc().toString("base64"),
        },
      ],
    };

    await tonConnection.sendTransaction(tx);

    await waiter();
  }

  async getJettonDetails(contractAddr: Address, owner: Address) {
    const tc = await getClient();

    const minter = await makeGetCall(contractAddr, "get_jetton_data", null, tc).then(
      async (reader) => {
        const totalSupply = reader.readBigNumber();
        reader.readBigNumber();
        const admin = reader.readAddress();
        const contentCell = await readJettonMetadata(reader.readCell());

        return {
          ...contentCell,
          totalSupply,
          admin,
        };
      },
    );

    const jWalletAddress = await makeGetCall(
      contractAddr,
      "get_wallet_address",
      beginCell().storeAddress(owner).endCell(),
      tc,
    ).then((reader) => reader.readAddress());

    const isDeployed = await tc.isContractDeployed(jWalletAddress);

    const jettonWallet = isDeployed
      ? await makeGetCall(jWalletAddress, "get_wallet_data", null, tc).then((reader) => {
          const balance = reader.readBigNumber();
          reader.readAddress(); // skip owner
          const jettonMasterAddress = reader.readAddress();

          return {
            balance,
            jWalletAddress,
            jettonMasterAddress,
          };
        })
      : null;

    return {
      minter,
      jettonWallet,
    };
  }

  async fixFaultyJetton(
    contractAddress: Address,
    data: {
      [s in JettonMetaDataKeys]?: string | undefined;
    },
    connection: TonConnectUI,
    walletAddress: string,
  ) {
    const waiter = await waitForSeqno(walletAddress);

    const body = updateMetadataBody(buildJettonOnchainMetadata(data));
    const tx: SendTransactionRequest = {
      validUntil: Date.now() + 5 * 60 * 1000,
      messages: [
        {
          address: contractAddress.toString(),
          amount: toNano(0.01).toString(),
          stateInit: undefined,
          payload: body.toBoc().toString("base64"),
        },
      ],
    };

    await connection.sendTransaction(tx);

    await waiter();
  }

  async updateMetadata(
    contractAddress: Address,
    data: {
      [s in JettonMetaDataKeys]?: string | undefined;
    },
    connection: TonConnectUI,
    walletAddress: string,
  ) {
    const waiter = await waitForSeqno(walletAddress);

    const tx: SendTransactionRequest = {
      validUntil: Date.now() + 5 * 60 * 1000,
      messages: [
        {
          address: contractAddress.toString(),
          amount: toNano(0.01).toString(),
          stateInit: undefined,
          payload: updateMetadataBody(buildJettonOnchainMetadata(data)).toBoc().toString("base64"),
        },
      ],
    };

    await connection.sendTransaction(tx);

    await waiter();
  }
}

const jettonDeployController = new JettonDeployController();
export { jettonDeployController };
