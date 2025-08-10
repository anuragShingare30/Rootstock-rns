'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Resolver from '@rsksmart/rns-resolver.js'
import { AddrResolver } from '@rsksmart/rns-sdk'
import { getRbtcBalance, getRskProvider, type RskNetwork } from '../lib/rsk'
import { utils, Wallet } from 'ethers'
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
    Array<{ address: string; symbol: string; name: string; balanceRaw: string; decimals?: number }>
  >([])
  const [nfts, setNfts] = useState<
    Array<{ contractAddress: string; name: string; symbol: string; contractDeployer: string | null; tokenType: string | null; tokenId: string }>
  >([])
  const [nftError, setNftError] = useState<string | null>(null)
  const [txs, setTxs] = useState<
    Array<{ hash: string; fromAddress: string; toAddress: string | null; asset: string | null; category: string | null; value: string | null }>
  >([])
  const [txError, setTxError] = useState<string | null>(null)

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
  setNfts([])
  setNftError(null)
  setTxs([])
  setTxError(null)
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

      const rb = await getRbtcBalance(addr, network)
      setRbtc({ ether: rb.ether })
      // Fetch tokens and NFTs in parallel, handle errors separately
      await Promise.all([
        (async () => {
          const res = await fetch(`/api/tokens?address=${addr}&network=${network}`, { cache: 'no-store' })
          const data = await res.json().catch(() => ({}))
          if (res.ok) {
            setTokens(Array.isArray(data.tokens) ? data.tokens : [])
          } else {
            const msg = typeof data?.error === 'string' ? data.error : `Failed to load tokens (${res.status})`
            // Surface in global error area to keep prior UX
            throw new Error(msg)
          }
        })(),
        (async () => {
          const res = await fetch(`/api/nfts?address=${addr}&network=${network}`, { cache: 'no-store' })
          const data = await res.json().catch(() => ({}))
          if (res.ok) {
            setNfts(Array.isArray(data.nfts) ? data.nfts : [])
          } else {
            const msg = typeof data?.error === 'string' ? data.error : `Failed to load NFTs (${res.status})`
            setNftError(msg)
          }
        })(),
        (async () => {
          const res = await fetch(`/api/txs?address=${addr}&network=${network}`, { cache: 'no-store' })
          const data = await res.json().catch(() => ({}))
          if (res.ok) {
            setTxs(Array.isArray(data.txs) ? data.txs : [])
          } else {
            const msg = typeof data?.error === 'string' ? data.error : `Failed to load transactions (${res.status})`
            setTxError(msg)
          }
        })(),
      ])
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
                <div className="text-gray-500">No ERC-20 tokens found.</div>
              ) : (
                <ul className="space-y-2">
                  {tokens.map((t) => {
                    const displaySymbol = ((t.symbol || '').trim() || 'UNKNOWN').toUpperCase()
                    let displayBalance = t.balanceRaw
                    try {
                      const dec = typeof t.decimals === 'number' ? t.decimals : 18
                      displayBalance = utils.formatUnits(t.balanceRaw, dec)
                    } catch {}
                    return (
                      <li key={t.address} className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{displaySymbol}</div>
                          <a
                            href={`${network === 'mainnet' ? 'https://explorer.rootstock.io' : 'https://explorer.testnet.rootstock.io'}/address/${t.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline"
                          >
                            {t.address}
                          </a>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{displayBalance}</div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="border rounded p-4">
              <div className="text-sm text-gray-600 mb-2">NFTs / Assets</div>
              {nftError && (
                <div className="mb-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{nftError}</div>
              )}
              {nfts.length === 0 && !nftError ? (
                <div className="text-gray-500">No NFTs found.</div>
              ) : null}
              {nfts.length > 0 && (
                <ul className="space-y-2">
                  {nfts.map((n, idx) => (
                    <li key={`${n.contractAddress}-${n.tokenId}-${idx}`} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <a
                          href={`${network === 'mainnet' ? 'https://explorer.rootstock.io' : 'https://explorer.testnet.rootstock.io'}/address/${n.contractAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline break-all"
                        >
                          {n.contractAddress}
                        </a>
                        <span className="text-xs text-gray-600">{n.tokenType || 'UNKNOWN'}</span>
                      </div>
                      <div className="text-sm font-medium">{n.name || 'Unnamed'}{n.symbol ? ` (${n.symbol})` : ''}</div>
                      <div className="text-xs text-gray-700">Token ID: {n.tokenId || '-'}</div>
                      <div className="text-xs text-gray-500">Deployer: {n.contractDeployer || '-'}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border rounded p-4 md:col-span-2">
              <div className="text-sm text-gray-600 mb-2">Recent Transactions</div>
              {txError && (
                <div className="mb-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{txError}</div>
              )}
              {txs.length === 0 && !txError ? (
                <div className="text-gray-500">No recent transactions found.</div>
              ) : null}
              {txs.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-600">
                        <th className="py-1 pr-4">Hash</th>
                        <th className="py-1 pr-4">From</th>
                        <th className="py-1 pr-4">To</th>
                        <th className="py-1 pr-4">Asset</th>
                        <th className="py-1 pr-4">Category</th>
                        <th className="py-1 pr-0">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txs.map((t) => (
                        <tr key={t.hash} className="border-t">
                          <td className="py-1 pr-4 break-all">
                            <a
                              href={`${network === 'mainnet' ? 'https://explorer.rootstock.io' : 'https://explorer.testnet.rootstock.io'}/tx/${t.hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {short(t.hash)}
                            </a>
                          </td>
                          <td className="py-1 pr-4 break-all">{t.fromAddress ? short(t.fromAddress) : '-'}</td>
                          <td className="py-1 pr-4 break-all">{t.toAddress ? short(t.toAddress) : '-'}</td>
                          <td className="py-1 pr-4">{t.asset || '-'}</td>
                          <td className="py-1 pr-4">{t.category || '-'}</td>
                          <td className="py-1 pr-0">{t.value || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

  <p className="text-xs text-gray-500">Powered by Alchemy Token API for Rootstock.</p>
      <p>mainnet: moneyonchain.rsk</p>
      <p>testnet: testing2.rsk</p>
    </div>
  )
}
