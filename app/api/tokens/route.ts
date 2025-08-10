import { NextRequest } from 'next/server'
import { Alchemy } from 'alchemy-sdk'

type Network = 'mainnet' | 'testnet'

function getAlchemyUrl(network: Network) {
  // Prefer explicit full URLs; accept either ALCHEMY_RSK_* or ROOTSTOCK_* variable names
  const explicit = network === 'mainnet'
    ? (process.env.ALCHEMY_RSK_MAINNET_URL || process.env.ROOTSTOCK_MAINNET_ALCHEMY_NETWORK_URL)
    : (process.env.ALCHEMY_RSK_TESTNET_URL || process.env.ROOTSTOCK_TESTNET_ALCHEMY_NETWORK_URL)
  if (explicit) return explicit
  const key = process.env.ALCHEMY_API_KEY
  if (key) {
    const host = network === 'mainnet'
      ? process.env.ALCHEMY_RSK_MAINNET_HOST || 'https://rootstock-mainnet.g.alchemy.com/v2/'
      : process.env.ALCHEMY_RSK_TESTNET_HOST || 'https://rootstock-testnet.g.alchemy.com/v2/'
    return host + key
  }
  return null
}

function createAlchemy(network: Network) {
  const url = getAlchemyUrl(network)
  if (!url) return null
  // Pass only the explicit URL (includes key). Avoid mixing apiKey+url to prevent misrouting.
  return new Alchemy({ url })
}

async function rpcCall(url: string, method: string, params: unknown[]) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 42, method, params }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`RPC ${method} failed: ${res.status}`)
  const json = await res.json()
  if (json.error) throw new Error(json.error?.message || 'RPC error')
  return json.result
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address')?.toLowerCase()
  const network = (searchParams.get('network') as Network) || 'mainnet'
  if (!address) {
    return new Response(JSON.stringify({ error: 'Missing address' }), { status: 400 })
  }

  const alchemy = createAlchemy(network)
  if (!alchemy) {
    return new Response(JSON.stringify({ error: 'Alchemy URL not configured' }), { status: 500 })
  }
  const urlStr = getAlchemyUrl(network)!

  const tokens: Array<{ contractAddress: string; tokenBalance: string }> = []

  try {
    // Fetch ERC-20 token balances using SDK (internally paginates)
    let balances: Array<{ contractAddress: string; tokenBalance: string | null }>
    try {
      const balancesResp = await alchemy.core.getTokenBalances(address)
      balances = balancesResp?.tokenBalances || []
  } catch {
      // Fallback to direct JSON-RPC if SDK transport fails
      const result = await rpcCall(urlStr, 'alchemy_getTokenBalances', [address, 'erc20', {}])
      balances = (result?.tokenBalances as Array<{ contractAddress: string; tokenBalance: string | null }>) || []
    }
    for (const b of balances) {
      try {
        const raw = b.tokenBalance ?? '0x0'
        const val = BigInt(raw)
        if (val > BigInt(0)) tokens.push({ contractAddress: b.contractAddress, tokenBalance: raw })
      } catch {
        // ignore parsing errors
      }
    }

    // Fetch metadata in parallel with modest concurrency
    const out: Array<{ address: string; symbol: string; name: string; balanceRaw: string; decimals?: number }> = []
    const limit = 8
    for (let i = 0; i < tokens.length; i += limit) {
      const slice = tokens.slice(i, i + limit)
      const metas = await Promise.all(
        slice.map(async (t) => {
          try {
            const meta = await alchemy.core.getTokenMetadata(t.contractAddress)
            return { t, meta }
          } catch {
            return { t, meta: null as unknown }
          }
        })
      )
      for (const { t, meta } of metas) {
        type Meta = { name?: string | null; symbol?: string | null; decimals?: number | null }
        const m = (meta ?? {}) as Meta
        const name = m.name ?? ''
        const symbol = m.symbol ?? ''
        const decimals = typeof m.decimals === 'number' ? m.decimals : undefined
        out.push({ address: t.contractAddress, name, symbol, decimals, balanceRaw: t.tokenBalance })
      }
    }

    // Fallback: For mainnet only, if name or symbol is empty, try CoinGecko by contract address
    async function fetchFromCoingecko(addr: string): Promise<{ name?: string; symbol?: string; decimals?: number } | null> {
      try {
        const url = `https://api.coingecko.com/api/v3/coins/rootstock/contract/${addr}`
        const res = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' })
        if (!res.ok) return null
        const json: unknown = await res.json()
        const j = json as {
          id?: string
          name?: string
          symbol?: string
          detail_platforms?: Record<string, { decimal_place?: number | null }>
        }
        const decimals = j?.detail_platforms?.rootstock?.decimal_place ?? undefined
        return { name: j?.name, symbol: j?.symbol, decimals: typeof decimals === 'number' ? decimals : undefined }
      } catch {
        return null
      }
    }

    function isUnknown(v?: string) {
      const s = (v || '').trim()
      return !s || s.toLowerCase() === 'unknown'
    }
    if (network === 'mainnet') {
      const toFix = out.filter((t) => isUnknown(t.name) || isUnknown(t.symbol))
      const cgLimit = 5
      for (let i = 0; i < toFix.length; i += cgLimit) {
        const slice = toFix.slice(i, i + cgLimit)
        const fixes = await Promise.all(
          slice.map(async (t) => ({ t, cg: await fetchFromCoingecko(t.address) }))
        )
        for (const { t, cg } of fixes) {
          if (cg) {
            if (!t.name?.trim() && cg.name) t.name = cg.name
            if (!t.symbol?.trim() && cg.symbol) t.symbol = cg.symbol.toUpperCase()
            if (t.decimals === undefined && typeof cg.decimals === 'number') t.decimals = cg.decimals
          }
        }
      }
    }

    return new Response(JSON.stringify({ tokens: out }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  } catch (e: unknown) {
  const msg = e instanceof Error ? e.message : 'Failed to fetch tokens'
  // Include a hint about env if URL was missing earlier or SDK failed without response
  return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}
