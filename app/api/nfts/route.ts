import { NextRequest } from 'next/server'
import { Alchemy } from 'alchemy-sdk'

type Network = 'mainnet' | 'testnet'

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

function toDecimalTokenId(id: string | null | undefined) {
  if (!id) return ''
  try {
    if (id.startsWith('0x')) return BigInt(id).toString(10)
    return BigInt(id).toString(10)
  } catch {
    return id
  }
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
    const nfts: Array<{ contractAddress: string; tokenId: string; tokenType?: string | null }> = []
    let pageKey: string | undefined = undefined
    const maxPages = 5
    let pages = 0

    do {
      const respUnknown: unknown = await alchemy.nft.getNftsForOwner(address, {
        pageKey,
        pageSize: 100,
        omitMetadata: true,
      })
      type OwnedNftLite = {
        contract?: { address?: string; contractAddress?: string; tokenType?: string | null } | Record<string, unknown> | null
        contractAddress?: string
        tokenId?: string
        tokenType?: string | null
      }
      const ownedRaw = (respUnknown as { ownedNfts?: unknown }).ownedNfts
      const owned: OwnedNftLite[] = Array.isArray(ownedRaw) ? (ownedRaw as OwnedNftLite[]) : []
      for (const it of owned) {
        let contractAddr: string | undefined =
          typeof it?.contract === 'object' && it?.contract && typeof (it.contract as { address?: unknown }).address === 'string'
            ? (it.contract as { address?: string }).address
            : undefined
        if (!contractAddr && typeof it?.contractAddress === 'string') contractAddr = it.contractAddress
        if (
          !contractAddr &&
          typeof it?.contract === 'object' &&
          it?.contract &&
          typeof (it.contract as { contractAddress?: unknown }).contractAddress === 'string'
        ) {
          contractAddr = (it.contract as { contractAddress?: string }).contractAddress
        }
        if (!contractAddr) continue
        const ctType = typeof it?.tokenType === 'string'
          ? it.tokenType
          : (typeof (it?.contract as { tokenType?: unknown } | null | undefined)?.tokenType === 'string'
              ? ((it!.contract as { tokenType?: string }).tokenType as string)
              : null)
        nfts.push({
          contractAddress: contractAddr,
          tokenId: toDecimalTokenId(it?.tokenId),
          tokenType: ctType,
        })
      }
      const nextKeyRaw = (respUnknown as { pageKey?: unknown }).pageKey
      pageKey = typeof nextKeyRaw === 'string' ? nextKeyRaw : undefined
      pages += 1
    } while (pageKey && pages < maxPages)

    if (nfts.length === 0) {
      return new Response(JSON.stringify({ nfts: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      })
    }

  const uniqueContracts = Array.from(new Set(nfts.map((x) => x.contractAddress.toLowerCase())))
  const metaMap = new Map<string, { name?: string | null; symbol?: string | null; contractDeployer?: string | null; tokenType?: string | null }>()
    const limit = 6
    for (let i = 0; i < uniqueContracts.length; i += limit) {
      const slice = uniqueContracts.slice(i, i + limit)
      const metas = await Promise.all(
        slice.map(async (addr) => {
          try {
            const md = await alchemy.nft.getContractMetadata(addr)
            return { addr, md: md as unknown }
          } catch {
            return { addr, md: null as unknown }
          }
        })
      )
      for (const { addr, md } of metas) {
        const cm = (md ?? {}) as {
          name?: string | null
          symbol?: string | null
          contractDeployer?: string | null
          tokenType?: string | null
          contractMetadata?: {
            name?: string | null
            symbol?: string | null
            contractDeployer?: string | null
            tokenType?: string | null
          }
        }
        const name = cm.name ?? cm.contractMetadata?.name ?? null
        const symbol = cm.symbol ?? cm.contractMetadata?.symbol ?? null
        const contractDeployer = cm.contractDeployer ?? cm.contractMetadata?.contractDeployer ?? null
        const tokenType = cm.tokenType ?? cm.contractMetadata?.tokenType ?? null
        metaMap.set(addr.toLowerCase(), { name, symbol, contractDeployer, tokenType })
      }
    }

    const out = nfts.map((it) => {
      const m = metaMap.get(it.contractAddress.toLowerCase()) || {}
      return {
        contractAddress: it.contractAddress,
        name: (m.name ?? '') as string,
        symbol: (m.symbol ?? '') as string,
        contractDeployer: (m.contractDeployer ?? null) as string | null,
        tokenType: (it.tokenType ?? m.tokenType ?? null) as string | null,
        tokenId: it.tokenId,
      }
    })

    return new Response(JSON.stringify({ nfts: out }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch NFTs'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}
