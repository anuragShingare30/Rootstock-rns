import { providers, utils, Contract, BigNumber } from 'ethers'

export type RskNetwork = 'mainnet' | 'testnet'

export const RSK_RPC_URLS: Record<RskNetwork, string> = {
  mainnet: process.env.NEXT_PUBLIC_RSK_RPC_URL_MAINNET || 'https://public-node.rsk.co',
  testnet: process.env.NEXT_PUBLIC_RSK_RPC_URL_TESTNET || 'https://public-node.testnet.rsk.co',
}

export function getRskProvider(network: RskNetwork = 'mainnet') {
  const url = RSK_RPC_URLS[network]
  return new providers.JsonRpcProvider(url)
}

export async function getRbtcBalance(address: string, network: RskNetwork) {
  const provider = getRskProvider(network)
  const balanceWei = await provider.getBalance(address)
  return {
    wei: balanceWei,
    ether: utils.formatEther(balanceWei),
  }
}

// Minimal ERC-20 ABI for balanceOf, symbol, name, decimals
export const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)'
]

export type TokenConfig = {
  address: string
  logo?: string
  coingeckoId?: string
}

// A tiny curated list as a starting point; can be expanded or fetched via an indexer later
export const DEFAULT_TOKENS: Record<RskNetwork, TokenConfig[]> = {
  mainnet: [
    // RIF
    { address: '0x2acc95758f8b5f583470ba265eb685a8f45fc9d5', coingeckoId: 'rif-token' },
    // RDOC (Money on Chain Dollar on RSK)
    { address: '0x2b2e4a6a2038d6cd3c38f41f5aabf638a722f6a5', coingeckoId: 'rdoc' },
  ],
  testnet: [
    // Example placeholder tokens (may not have balances); replace with actual testnet tokens if needed
    {address:'0x19f64674D8a5b4e652319F5e239EFd3bc969a1FE', coingeckoId: 'trif-token'}
  ],
}

export async function getErc20Balances(address: string, network: RskNetwork) {
  const provider = getRskProvider(network)
  const tokens = DEFAULT_TOKENS[network]

  const results = await Promise.all(tokens.map(async (t) => {
    const c = new Contract(t.address, ERC20_ABI, provider)
    try {
      const [raw, symbol, name, decimals] = await Promise.all([
        c.balanceOf(address),
        c.symbol(),
        c.name(),
        c.decimals(),
      ])
      return {
        address: t.address,
        symbol,
        name,
        decimals: Number(decimals),
        raw,
        logo: t.logo,
        coingeckoId: t.coingeckoId,
      }
  } catch {
      return null
    }
  }))

  return results.filter(Boolean) as Array<{
    address: string
    symbol: string
    name: string
    decimals: number
    raw: BigNumber
    logo?: string
    coingeckoId?: string
  }>
}
