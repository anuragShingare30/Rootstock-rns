'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Resolver from '@rsksmart/rns-resolver.js'
import { AddrResolver } from '@rsksmart/rns-sdk'
import { getErc20Balances, getRbtcBalance, getRskProvider, type RskNetwork } from '../lib/rsk'
import { utils, Wallet, BigNumber } from 'ethers'
import { Buffer as BufferPolyfill } from 'buffer'

function isValidRns(name: string) {
  const n = name.trim().toLowerCase()
  if (!n.endsWith('.rsk')) return false
  const label = n.slice(0, -4) // remove .rsk
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
}

function short(addr: string) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''
}

export default function RnsDashboard() {
  const [network, setNetwork] = useState<RskNetwork>('mainnet')
  const [input, setInput] = useState('')
  const [valid, setValid] = useState<boolean>(false)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [address, setAddress] = useState<string>('')

  const [rbtc, setRbtc] = useState<{ ether: string } | null>(null)
  const [tokens, setTokens] = useState<
    Array<{ address: string; symbol: string; name: string; decimals: number; raw: BigNumber; logo?: string }>
  >([])

  useEffect(() => {
    setValid(isValidRns(input))
  }, [input])

  // Ensure Buffer exists in browser for rns-sdk
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const w = window as unknown as { Buffer?: unknown } & Record<string, unknown>
      if (typeof w.Buffer === 'undefined') {
        // We store polyfill as unknown to avoid any casts
        w.Buffer = BufferPolyfill as unknown
      }
    }
  }, [])

  const resolver = useMemo(() => {
    return network === 'mainnet'
      ? Resolver.forRskMainnet({})
      : Resolver.forRskTestnet({})
  }, [network])

  const registryAddress = useMemo(
    () => (network === 'mainnet' ? '0xcb868aeabd31e2b66f74e9a55cf064abb31a4ad5' : '0x7d284aaac6e925aad802a53c0c69efe3764597b8'),
    [network]
  )

  const resolveName = useCallback(async () => {
    setError(null)
    setResolving(true)
    setAddress('')
    setRbtc(null)
    setTokens([])
    try {
      const name = input.trim().toLowerCase()
      if (!isValidRns(name)) throw new Error('Invalid RNS name format')

      // First try rns-sdk AddrResolver (ethers.js based)
      let addr: string | undefined
      try {
  const provider = getRskProvider(network)
  const signer = Wallet.createRandom().connect(provider)
  const ar = new AddrResolver(registryAddress, signer)
        addr = await ar.addr(name)
      } catch {
        // Fallback to rns-resolver.js
        addr = await resolver.addr(name)
      }
      if (!addr || addr === '0x0000000000000000000000000000000000000000') {
        throw new Error('Name not registered or no address set')
      }
      setAddress(addr)

      const [rb, erc20s] = await Promise.all([
        getRbtcBalance(addr, network),
        getErc20Balances(addr, network),
      ])
      setRbtc({ ether: rb.ether })
      setTokens(erc20s)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resolve'
      setError(msg)
    } finally {
      setResolving(false)
    }
  }, [input, network, resolver, registryAddress])

  const canSearch = valid && !resolving

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (canSearch) void resolveName()
  }

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">RNS Address & Balances</h1>

      <form onSubmit={onSubmit} className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">RNS name</label>
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="alice.rsk"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          {!valid && input.length > 0 && (
            <p className="text-xs text-red-600 mt-1">Enter a valid .rsk name (letters, digits, hyphens)</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Network</label>
          <select
            className="border rounded px-3 py-2"
            value={network}
            onChange={(e) => setNetwork(e.target.value as RskNetwork)}
          >
            <option value="mainnet">Rootstock Mainnet</option>
            <option value="testnet">Rootstock Testnet</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={!canSearch}
          className="bg-black text-white rounded px-4 py-2 disabled:opacity-50"
        >
          {resolving ? 'Resolving…' : 'Resolve'}
        </button>
      </form>

      {error && (
        <div className="p-3 border border-red-300 bg-red-50 text-red-800 rounded">{error}</div>
      )}

      {address && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-medium">Resolved address:</span>
            <code className="px-2 py-1 bg-gray-100 rounded">{short(address)}</code>
            <button
              className="text-sm underline"
              onClick={() => navigator.clipboard.writeText(address)}
            >
              Copy
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded p-4">
              <div className="text-sm text-gray-600">RBTC</div>
              <div className="text-xl font-semibold">{rbtc ? `${rbtc.ether} RBTC` : '—'}</div>
            </div>

            <div className="border rounded p-4">
              <div className="text-sm text-gray-600 mb-2">Tokens (ERC-20)</div>
              {tokens.length === 0 ? (
                <div className="text-gray-500">No known tokens detected in the curated list.</div>
              ) : (
                <ul className="space-y-2">
                  {tokens.map((t) => (
                    <li key={t.address} className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{t.name} ({t.symbol})</div>
                        <div className="text-xs text-gray-600">{t.address}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">
                          {utils.formatUnits(t.raw, t.decimals)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500">
        This demo uses a small, curated token list. For full holdings, integrate The Graph or a token indexer.
      </p>
      <p>mainnet: moneyonchain.rsk</p>
      <p>testnet: testing2.rsk</p>
    </div>
  )
}
