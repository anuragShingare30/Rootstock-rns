'use client'

import { useState } from 'react'

export default function SearchPage() {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    name: string
    network: 'mainnet' | 'testnet'
    available: boolean | null
    rifPricePerYear: string | null
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
      const res = await fetch(`/api/rns/availability?name=${encodeURIComponent(n)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to fetch')
      setResult(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-4">
      <h1 className="text-xl font-semibold">Search RNS Domain</h1>
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder="yourname.rsk"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
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
          <div className="mt-1"><span className="font-medium">Price (RIF / year):</span> {result.rifPricePerYear ?? '-'}</div>
        </div>
      )}
    </main>
  )
}
