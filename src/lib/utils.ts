import { Address, beginCell, toNano, TonClient } from "@ton/ton";
import { JettonDeployParams, JETTON_DEPLOY_GAS } from "./deploy-controller";
import { initData, JETTON_MINTER_CODE, mintBody } from "./jetton-minter";
import { getClient } from "./get-ton-client";
import { makeGetCall } from "./make-get-call";

export async function sleep(time: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}

export function zeroAddress(): Address {
  return beginCell()
    .storeUint(2, 2)
    .storeUint(0, 1)
    .storeUint(0, 8)
    .storeUint(0, 256)
    .endCell()
    .beginParse()
    .loadAddress();
}

async function getSeqno(address: Address, tc: TonClient) {
  return makeGetCall(address, "seqno", null, tc).then((reader) => reader.readBigNumber());
}

export async function waitForSeqno(address: string) {
  const tc = await getClient();
  const ownerAddress = Address.parse(address);
  const seqnoBefore = await getSeqno(ownerAddress, tc);

  return async () => {
    for (let attempt = 0; attempt < 25; attempt++) {
      await sleep(3000);
      const seqnoAfter = await getSeqno(ownerAddress, tc);
      if (seqnoAfter > seqnoBefore) return;
    }
    throw new Error("Timeout");
  };
}

export async function waitForContractDeploy(address: Address, client: TonClient) {
  let isDeployed = false;
  let maxTries = 25;
  while (!isDeployed && maxTries > 0) {
    maxTries--;
    isDeployed = await client.isContractDeployed(address);
    if (isDeployed) return;
    await sleep(3000);
  }
  throw new Error("Timeout");
}

export const createDeployParams = (params: JettonDeployParams, offchainUri?: string) => {
  const queryId = parseInt(process.env.REACT_APP_DEPLOY_QUERY_ID ?? "0");

  return {
    code: JETTON_MINTER_CODE,
    data: initData(params.owner, params.onchainMetaData, offchainUri),
    deployer: params.owner,
    value: JETTON_DEPLOY_GAS,
    message: mintBody(params.owner, params.amountToMint, toNano(0.2), queryId),
  };
};
