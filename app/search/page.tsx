'use client'

import { useState } from 'react'
import Resolver from '@rsksmart/rns-resolver.js'

export default function SearchPage() {
  const [name, setName] = useState('')
  const [years, setYears] = useState<number>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    name: string
    available: boolean
    totalPriceRif: number
  } | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setResult(null)
    const n = name.trim().toLowerCase()
    if (!n.endsWith('.rsk')) {
      setError('Enter a .rsk name')
      return
    }
    setLoading(true)
    try {
      const resolver = Resolver.forRskMainnet({})
      const addr = await resolver.addr(n)
      const zero = '0x0000000000000000000000000000000000000000'
      const resolved = !!addr && addr.toLowerCase() !== zero
      const available = !resolved
      const totalPriceRif = available ? (Math.max(1, Math.min(10, years)) * 2) : 0
      setResult({ name: n, available, totalPriceRif })
  } catch {
      // If resolver fails (e.g., 'Domain has no resolver'), treat as available and price = years * 2 RIF
      const totalPriceRif = Math.max(1, Math.min(10, years)) * 2
      setResult({ name: n, available: true, totalPriceRif })
      setError(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-4">
      <h1 className="text-xl font-semibold">Search RNS Domain</h1>
    <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
        <div className="md:col-span-3">
          <label className="block text-sm font-medium mb-1">Mainnet domain</label>
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="yourname.rsk"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Years</label>
          <input
            type="number"
            min={1}
            max={10}
            value={years}
            onChange={(e) => setYears(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
            className="w-full border rounded px-3 py-2"
          />
        </div>
        <button disabled={loading} className="bg-black text-white rounded px-4 py-2 disabled:opacity-50">
          {loading ? 'Checking…' : 'Check'}
        </button>
      </form>
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
      {result && (
        <div className="border rounded p-4">
      <div className="text-sm text-gray-600">Network: Rootstock Mainnet</div>
      <div className="mt-1"><span className="font-medium">Domain:</span> {result.name}</div>
      <div className="mt-1"><span className="font-medium">Available:</span> {result.available ? 'Yes' : 'No'}</div>
      <div className="mt-1"><span className="font-medium">Price (RIF):</span> {result.totalPriceRif} RIF</div>
        </div>
      )}
    </main>
  )
}
