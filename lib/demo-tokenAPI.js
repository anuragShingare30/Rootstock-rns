import { Alchemy, Network } from "alchemy-sdk";

const settings = {
  apiKey: "k2S12DG4sLVAfY4Yt4N_d",
  network: Network.ROOTSTOCK_MAINNET,
};
const alchemy = new Alchemy(settings);

// The wallet address / token we want to query for:
const ownerAddr = "0xDda6F92535679111c072C37900742e6341599889";
const balances = await alchemy.core.getTokenBalances(ownerAddr, [
  "0x2aCc95758f8b5F583470bA265Eb685a8f45fC9D5",
]);

// The token address we want to query for metadata:
const metadata = await alchemy.core.getTokenMetadata(
  "0x2aCc95758f8b5F583470bA265Eb685a8f45fC9D5"
);

console.log("Token Balances:");
console.log(balances);
console.log("Token Metadata: ");
console.log(metadata);