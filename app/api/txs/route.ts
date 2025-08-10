import { NextRequest } from 'next/server'
import { Alchemy, AssetTransfersCategory, SortingOrder } from 'alchemy-sdk'

type Network = 'mainnet' | 'testnet'

type TxRow = {
  hash: string
  fromAddress: string
  toAddress: string | null
  asset: string | null
  category: string | null
  value: string | null
  blockNum: string | null
}

function getAlchemyUrl(network: Network) {
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

function normalizeTransfer(t: unknown): TxRow | null {
  const o = t as {
    hash?: string
    uniqueId?: string
    from?: string
    to?: string | null
    asset?: string | null
    category?: string | null
    value?: string | null
    blockNum?: string | null
  } | null
  if (!o) return null
  const hash = (o.hash || '') as string
  if (!hash) return null
  return {
    hash,
    fromAddress: (o.from || '') as string,
    toAddress: (o.to ?? null) as string | null,
    asset: (o.asset ?? null) as string | null,
    category: (o.category ?? null) as string | null,
    value: (o.value ?? null) as string | null,
    blockNum: (o.blockNum ?? null) as string | null,
  }
}

function uniqueKey(tx: TxRow): string {
  return `${tx.blockNum || '0x0'}:${tx.hash}:${tx.fromAddress}:${tx.toAddress || ''}`
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

  try {
    const categories: AssetTransfersCategory[] = [
      AssetTransfersCategory.EXTERNAL,
      AssetTransfersCategory.ERC20,
      AssetTransfersCategory.ERC721,
      AssetTransfersCategory.ERC1155
    ]

    let fromRes: unknown
    let toRes: unknown
    const urlStr = getAlchemyUrl(network)!
    try {
      const [fr, tr] = await Promise.all([
        alchemy.core.getAssetTransfers({
          fromAddress: address,
          category: categories,
          maxCount: 20,
          order: SortingOrder.DESCENDING,
          withMetadata: false,
        }),
        alchemy.core.getAssetTransfers({
          toAddress: address,
          category: categories,
          maxCount: 20,
          order: SortingOrder.DESCENDING,
          withMetadata: false,
        }),
      ])
      fromRes = fr as unknown
      toRes = tr as unknown
    } catch {
      // Fallback to direct JSON-RPC if SDK transport fails (e.g., "missing response")
      const cat = ['external', 'erc20', 'erc721', 'erc1155']
      const maxCountHex = '0x14' // 20
      const [frRpc, trRpc] = await Promise.all([
        rpcCall(urlStr, 'alchemy_getAssetTransfers', [{
          fromAddress: address,
          category: cat,
          maxCount: maxCountHex,
          order: 'desc',
          withMetadata: false,
        }]),
        rpcCall(urlStr, 'alchemy_getAssetTransfers', [{
          toAddress: address,
          category: cat,
          maxCount: maxCountHex,
          order: 'desc',
          withMetadata: false,
        }]),
      ])
      fromRes = frRpc
      toRes = trRpc
    }

    const rows: TxRow[] = []
    const addList = (arr: unknown) => {
      const list = (arr as { transfers?: unknown[] } | null)?.transfers
      if (Array.isArray(list)) {
        for (const it of list) {
          const r = normalizeTransfer(it)
          if (r) rows.push(r)
        }
      }
    }

    addList(fromRes as unknown)
    addList(toRes as unknown)

    const map = new Map<string, TxRow>()
    for (const tx of rows) map.set(uniqueKey(tx), tx)

    const sorted = Array.from(map.values()).sort((a, b) => {
      const ab = a.blockNum && a.blockNum.startsWith('0x') ? BigInt(a.blockNum) : BigInt(0)
      const bb = b.blockNum && b.blockNum.startsWith('0x') ? BigInt(b.blockNum) : BigInt(0)
      if (ab === bb) return 0
      return bb > ab ? 1 : -1
    })

    const top = sorted.slice(0, 20).map((t) => ({
      hash: t.hash,
      fromAddress: t.fromAddress,
      toAddress: t.toAddress,
      asset: t.asset,
      category: t.category,
      value: t.value,
    }))

    return new Response(JSON.stringify({ txs: top }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch transactions'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}
