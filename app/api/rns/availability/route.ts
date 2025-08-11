
import { NextRequest } from 'next/server'
import { providers, utils as ethersUtils, BigNumber, Wallet } from 'ethers'
import { PartnerRegistrar } from '@rsksmart/rns-sdk';

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
    const label = name.endsWith('.rsk') ? name.slice(0, -4) : name
    let available: boolean = false
    let rifPricePerYear: string | null = null
    // Use PartnerRegistrar for mainnet (network param is 'mainnet', addresses optional)
    const partnerRegistrar = new PartnerRegistrar(signer, 'mainnet')
    try {
      const avail = await partnerRegistrar.available(label)
      available = (typeof avail === 'boolean') ? avail : (avail === 'true')
    } catch {
      available = false
    }
    try {
      const duration = BigNumber.from('1')
      const price = await partnerRegistrar.price(label, duration)
      rifPricePerYear = ethersUtils.formatUnits(price.toString(), 18)
    } catch {
      rifPricePerYear = null
    }
    return new Response(
      JSON.stringify({ name, network: 'mainnet', available, rifPricePerYear }),
      { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }
    )
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch availability'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}