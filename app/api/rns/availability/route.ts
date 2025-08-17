
import { NextRequest } from 'next/server'
import { providers, Wallet } from 'ethers'
import { AddrResolver } from '@rsksmart/rns-sdk'

function getRskMainnetProvider() {
  const url = process.env.NEXT_PUBLIC_RSK_RPC_URL_MAINNET || 'https://public-node.rsk.co'
  // Provide explicit chain metadata to avoid noNetwork detection issues
  return new providers.JsonRpcProvider(url, { name: 'rootstock', chainId: 30 })
}

function isValidRns(name: string) {
  const n = name.trim().toLowerCase()
  if (!n.endsWith('.rsk')) return false
  const label = n.slice(0, -4)
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const name = searchParams.get('name')?.toLowerCase() || ''
  if (!isValidRns(name)) {
    return new Response(JSON.stringify({ error: 'Invalid .rsk name' }), { status: 400 })
  }
  try {
    const provider = getRskMainnetProvider()
    const signer = Wallet.createRandom().connect(provider)
    const registryAddress = '0xcb868aeabd31e2b66f74e9a55cf064abb31a4ad5'
    const addrResolver = new AddrResolver(registryAddress, signer)

    let available = false
    const zero = '0x0000000000000000000000000000000000000000'
    try {
      const resolved = await addrResolver.addr(name)
      available = !resolved || resolved.toLowerCase() === zero
    } catch {
      // If resolution fails (e.g., unregistered), treat as available
      available = true
    }

    // Fixed price policy: 2 RIF per year (mainnet)
    const rifPricePerYear = '2'
    return new Response(
      JSON.stringify({ name, network: 'mainnet', available, rifPricePerYear }),
      { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }
    )
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch availability'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}