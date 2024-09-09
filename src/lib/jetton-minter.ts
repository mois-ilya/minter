import { Cell, beginCell, Address, toNano, Dictionary, Slice, Builder } from "@ton/core";

import walletHex from "./contracts/jetton-wallet.compiled.json";
import minterHex from "./contracts/jetton-minter.compiled.json";
import { Sha256 } from "@aws-crypto/sha256-js";
import axios from "axios";

const ONCHAIN_CONTENT_PREFIX = 0x00;
const OFFCHAIN_CONTENT_PREFIX = 0x01;
const SNAKE_PREFIX = 0x00;

const SNAKE_CELL_MAX_SIZE_BYTES = Math.floor((1023 - 8) / 8); // 126 bytes

export const JETTON_WALLET_CODE = Cell.fromBoc(Buffer.from(walletHex.hex, "hex"))[0];
export const JETTON_MINTER_CODE = Cell.fromBoc(Buffer.from(minterHex.hex, "hex"))[0]; // code cell from build output

enum OPS {
  ChangeAdmin = 3,
  ReplaceMetadata = 4,
  Mint = 21,
  InternalTransfer = 0x178d4519,
  Transfer = 0xf8a7ea5,
  Burn = 0x595f07bc,
}

export interface JettonMetadata {
  name?: string;
  description?: string;
  image?: string;
  symbol?: string;
  image_data?: string;
  decimals?: string;
  uri?: string;
}

export type JettonMetaDataKeys = keyof JettonMetadata;

const jettonOnChainMetadataSpec: Map<JettonMetaDataKeys, "utf8" | "ascii" | undefined> = new Map([
  ["name", "utf8"],
  ["description", "utf8"],
  ["image", "ascii"],
  ["symbol", "utf8"],
  ["image_data", undefined],
  ["decimals", "utf8"],
  ["uri", "ascii"],
]);

const sha256 = (str: string) => {
  const sha = new Sha256();
  sha.update(str);
  return Buffer.from(sha.digestSync());
};

function bufferToChunks(buff: Buffer, chunkSize: number) {
  const chunks: Buffer[] = [];
  while (buff.byteLength > 0) {
    chunks.push(buff.subarray(0, chunkSize));
    buff = buff.subarray(chunkSize);
  }
  return chunks;
}

export function makeSnakeCell(data: Buffer): Cell {
  const chunks = bufferToChunks(data, SNAKE_CELL_MAX_SIZE_BYTES);

  const [firstChunk, ...tailChunks] = chunks;

  const secondChunk = tailChunks[0];
  const tailBuilder =
    tailChunks.length !== 0 &&
    tailChunks.toReversed().reduce((prevBuilder, chunk) => {
      prevBuilder.storeBuffer(chunk);
      return secondChunk === chunk ? prevBuilder : beginCell().storeRef(prevBuilder);
    }, beginCell());

  const rootBuilder = beginCell().storeUint(SNAKE_PREFIX, 8);
  firstChunk && rootBuilder.storeBuffer(firstChunk);
  tailBuilder && rootBuilder.storeRef(tailBuilder);

  return rootBuilder.endCell();
}

export function flattenSnakeCell(cell: Cell): Buffer {
  const sliceToBuffer = (c: Cell, v: Buffer, isFirst: boolean): Buffer => {
    const s = c.beginParse();

    if (isFirst && s.loadUint(8) !== SNAKE_PREFIX)
      throw new Error("Only snake format is supported");

    if (s.remainingBits === 0) return v;

    const data = s.loadBuffer(s.remainingBits / 8);
    v = Buffer.concat([v, data]);

    const newCell = s.remainingRefs > 0 ? s.loadRef() : null;
    s.endParse();

    return newCell ? sliceToBuffer(newCell, v, false) : v;
  };

  const buffer = sliceToBuffer(cell, Buffer.from(""), true);

  return buffer;
}

function toDictKey(key: string): bigint {
  return BigInt(`0x${sha256(key).toString("hex")}`);
}

export function buildJettonOnchainMetadata(data: {
  [s in JettonMetaDataKeys]?: string | undefined;
}): Cell {
  const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());

  Object.entries(data).forEach(([k, v]: [string, string | undefined]) => {
    const key = k as JettonMetaDataKeys;

    if (!jettonOnChainMetadataSpec.get(key)) {
      throw new Error(`Unsupported onchain key: ${k}`);
    }

    if (v === undefined || v === "") return;

    let bufferToStore = Buffer.from(v, jettonOnChainMetadataSpec.get(key));

    dict.set(toDictKey(k), makeSnakeCell(bufferToStore));
  });

  return beginCell().storeUint(ONCHAIN_CONTENT_PREFIX, 8).storeDict(dict).endCell();
}

export function buildJettonOffChainMetadata(contentUri: string): Cell {
  return beginCell()
    .storeInt(OFFCHAIN_CONTENT_PREFIX, 8)
    .storeBuffer(Buffer.from(contentUri, "ascii"))
    .endCell();
}

export type PersistenceType = "onchain" | "offchain_private_domain" | "offchain_ipfs";

export async function readJettonMetadata(contentCell: Cell): Promise<{
  persistenceType: PersistenceType;
  metadata: { [s in JettonMetaDataKeys]?: string };
  isJettonDeployerFaultyOnChainData?: boolean;
}> {
  const contentSlice = contentCell.beginParse();
  const prefix = contentSlice.loadInt(8);

  switch (prefix) {
    case ONCHAIN_CONTENT_PREFIX: {
      const res = parseJettonOnchainMetadata(contentSlice);

      let persistenceType: PersistenceType = "onchain";

      if (res.metadata.uri) {
        const offchainMetadata = await getJettonMetadataFromExternalUri(res.metadata.uri);
        persistenceType = offchainMetadata.isIpfs ? "offchain_ipfs" : "offchain_private_domain";
        res.metadata = {
          ...res.metadata,
          ...offchainMetadata.metadata,
        };
      }

      return {
        persistenceType: persistenceType,
        ...res,
      };
    }
    case OFFCHAIN_CONTENT_PREFIX: {
      const { metadata, isIpfs } = await parseJettonOffchainMetadata(contentSlice);
      return {
        persistenceType: isIpfs ? "offchain_ipfs" : "offchain_private_domain",
        metadata,
      };
    }
    default:
      throw new Error("Unexpected jetton metadata content prefix");
  }
}

async function parseJettonOffchainMetadata(contentSlice: Slice): Promise<{
  metadata: { [s in JettonMetaDataKeys]?: string };
  isIpfs: boolean;
}> {
  console.log(contentSlice.loadStringTail());
  return getJettonMetadataFromExternalUri(contentSlice.loadStringTail());
}

async function getJettonMetadataFromExternalUri(uri: string) {
  const jsonURI = uri.replace("ipfs://", "https://ipfs.io/ipfs/");

  return {
    metadata: (await axios.get(jsonURI)).data,
    isIpfs: /(^|\/)ipfs[.:]/.test(jsonURI),
  };
}

function parseJettonOnchainMetadata(contentSlice: Slice): {
  metadata: { [s in JettonMetaDataKeys]?: string };
  isJettonDeployerFaultyOnChainData: boolean;
} {
  let isJettonDeployerFaultyOnChainData = false; // TODO: check if this is used

  const dict = contentSlice.loadDict(Dictionary.Keys.BigUint(256), {
    serialize(src: Buffer, builder: Builder) {},
    parse: (src: Slice): Buffer => {
      if (src.remainingRefs === 0) {
        isJettonDeployerFaultyOnChainData = true;
        return flattenSnakeCell(src.asCell());
      }
      return flattenSnakeCell(src.loadRef());
    },
  });

  const res = Object.fromEntries(
    Array.from(jettonOnChainMetadataSpec).map(([k, v]) => {
      const val = dict.get(toDictKey(k))?.toString(v);
      return [k, val];
    }),
  );

  return {
    metadata: res,
    isJettonDeployerFaultyOnChainData,
  };
}

export function initData(
  owner: Address,
  data?: { [s in JettonMetaDataKeys]?: string | undefined },
  offchainUri?: string,
) {
  if (!data && !offchainUri) {
    throw new Error("Must either specify onchain data or offchain uri");
  }

  const metadata = offchainUri
    ? buildJettonOffChainMetadata(offchainUri)
    : buildJettonOnchainMetadata(data!);

  return beginCell()
    .storeCoins(0)
    .storeAddress(owner)
    .storeRef(metadata)
    .storeRef(JETTON_WALLET_CODE)
    .endCell();
}

export function mintBody(
  owner: Address,
  jettonValue: bigint,
  transferToJWallet: bigint,
  queryId: number,
): Cell {
  return beginCell()
    .storeUint(OPS.Mint, 32)
    .storeUint(queryId, 64) // queryid
    .storeAddress(owner)
    .storeCoins(transferToJWallet)
    .storeRef(
      // internal transfer message
      beginCell()
        .storeUint(OPS.InternalTransfer, 32)
        .storeUint(0, 64)
        .storeCoins(jettonValue)
        .storeAddress(null)
        .storeAddress(owner)
        .storeCoins(toNano(0.001))
        .storeBit(false) // forward_payload in this slice, not separate cell
        .endCell(),
    )
    .endCell();
}

export function burn(amount: bigint, responseAddress: Address) {
  return beginCell()
    .storeUint(OPS.Burn, 32) // action
    .storeUint(1, 64) // query-id
    .storeCoins(amount)
    .storeAddress(responseAddress)
    .storeDict(null)
    .endCell();
}

export function transfer(to: Address, from: Address, jettonAmount: bigint) {
  return beginCell()
    .storeUint(OPS.Transfer, 32)
    .storeUint(1, 64)
    .storeCoins(jettonAmount)
    .storeAddress(to)
    .storeAddress(from)
    .storeBit(false)
    .storeCoins(toNano(0.001))
    .storeBit(false) // forward_payload in this slice, not separate cell
    .endCell();
}

export function changeAdminBody(newAdmin: Address): Cell {
  return beginCell()
    .storeUint(OPS.ChangeAdmin, 32)
    .storeUint(0, 64) // queryid
    .storeAddress(newAdmin)
    .endCell();
}

export function updateMetadataBody(metadata: Cell): Cell {
  return beginCell()
    .storeUint(OPS.ReplaceMetadata, 32)
    .storeUint(0, 64) // queryid
    .storeRef(metadata)
    .endCell();
}
