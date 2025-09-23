'use client'

import React, { useEffect, useState } from 'react'
import FeaturedCard from '@/components/FeaturedCard'
import FeaturedEmbed from '@/components/FeaturedEmbed'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { canFeatureUrl } from '@/lib/embed-policy'
import type { ScoredFeatured } from '@/lib/featured-ranker'
import { computeFeaturedScoreBreakdown, computeAuthorMultipliers } from '@/lib/featured-ranker'

type Range = 'week' | 'month' | 'all'
type Ranker = 'baseline' | 'eb' | 'zscore' | 'conf'

function fmt(n: number) {
  if (!isFinite(n)) return '0'
  const abs = Math.abs(n)
  if (abs >= 1000) return n.toFixed(0)
  return n.toFixed(2)
}

function percentile(arr: number[], p: number) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const i = Math.floor((s.length - 1) * Math.min(1, Math.max(0, p)))
  return s[i]
}

function ageDays(iso: string): number {
  const created = new Date(iso).getTime()
  return Math.max(0, (Date.now() - created) / 86400000)
}

function computeEbBreakdown(items: ScoredFeatured[], item: ScoredFeatured, range: Range) {
  const xs = items.map((it) => it.finalXp ?? 0)
  const meanXp = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
  const p1 = percentile(xs, 0.01)
  const p99 = percentile(xs, 0.99)
  const params = range === 'week'
    ? { kBase: 5, kLegacy: 8, gamma: 1.0, beta: 0.25, rcap: 2.3, HL: 5, c: 5 }
    : range === 'month'
    ? { kBase: 6, kLegacy: 10, gamma: 1.3, beta: 0.25, rcap: 2.5, HL: 14, c: 5 }
    : { kBase: 8, kLegacy: 12, gamma: 1.0, beta: 0.15, rcap: 2.0, HL: 180, c: 5 }
  const n = Math.max(0, item.reviewCount ?? 0)
  const k = (item.origin === 'legacy' || n === 0) ? params.kLegacy : params.kBase
  const alpha = n / (n + k)
  const base = Math.min(p99, Math.max(p1, item.finalXp ?? 0))
  const finalXpAdj = alpha * base + (1 - alpha) * meanXp
  const consensus = Math.max(-params.c, Math.min(params.c, item.consensusScore ?? 0))
  const consBonus = params.gamma * consensus
  const reviewsMult = 1 + params.beta * Math.min(Math.log1p(n), params.rcap)
  const age = ageDays(item.createdAt)
  const decay = Math.exp(-age / params.HL)
  const raw = Math.max(0, finalXpAdj + consBonus) * reviewsMult
  const score = raw * decay
  return { finalXpAdj, consensus, consBonus, reviewsMult, age, HL: params.HL, score }
}

export default function FeaturedBrowser() {
  const [range, setRange] = useState<Range>('week')
  // Default to EB (shrinkage) ranker with author boost
  const [ranker, setRanker] = useState<Ranker>('eb')
  const [authorBoost, setAuthorBoost] = useState<boolean>(true)
  const [autoTune, setAutoTune] = useState<boolean>(false)
  const [data, setData] = useState<Record<Range, ScoredFeatured[]>>({ week: [], month: [], all: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRange = async (r: Range, rk: Ranker, ab: boolean, at: boolean) => {
    const url = `/api/featured?range=${r}&limit=24&ranker=${rk}&authorBoost=${ab}&autoTune=${at}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error('fetch failed')
    const json = await res.json()
    return (json?.data?.items ?? []) as ScoredFeatured[]
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchRange(range, ranker, authorBoost, autoTune)
      .then((items) => { if (!cancelled) setData((d) => ({ ...d, [range]: items })) })
      .catch((e) => { if (!cancelled) setError(String(e?.message || e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [range, ranker, authorBoost, autoTune])

  const renderMasonry = (items: ScoredFeatured[], r: Range) => {
    // Server already filters eligibility; avoid double-filtering to prevent accidental empty lists
    const filtered = items
    const authorMultMap = authorBoost ? computeAuthorMultipliers(filtered) : new Map<string, number>()
    if (!filtered.length) {
      return (
        <div className="rounded-md border p-6 text-center text-muted-foreground space-y-2">
          <div>{loading ? 'Loading…' : 'Nothing to feature yet.'}</div>
          {error && <div className="text-xs text-red-500">{error}</div>}
        </div>
      )
    }
    return (
      <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5 gap-6">
        {filtered.map((item) => (
          <FeaturedCard key={item.id} url={item.url}>
            {ranker === 'baseline' ? (
              (() => {
                const b = computeFeaturedScoreBreakdown(item, r)
                const base = fmt(b.base)
                const cons = fmt(Math.max(0, b.consensus))
                const logTerm = fmt(b.reviewFactor)
                const age = fmt(b.ageDays)
                const hl = fmt(b.halfLifeDays)
                const mult = authorBoost ? (authorMultMap.get(item.authorKey || item.userId || `legacy:${item.id}`) ?? 1) : 1
                const score = fmt(b.score * mult)
                return (
                  <>
                    {/*
                    <div className="w-full px-3 py-1.5 border-b bg-muted/40 text-[10px] leading-snug font-mono text-muted-foreground">
                      <div>score = (finalXp + max(0, consensus)*2) * (1 + 0.3*log1p(reviews)) * exp(-age/HL){authorBoost ? ' * authorMult' : ''}</div>
                      <div>score = (({base} + {cons}*2) * (1 + 0.3*{logTerm})) * exp(-{age}/{hl}){authorBoost ? ` * ${fmt(mult)}` : ''} = {score}</div>
                    </div>
                    */}
                  </>
                )
              })()
            ) : (
              (() => {
                if (ranker === 'eb') {
                  const eb = computeEbBreakdown(filtered, item, r)
                  const mult = authorBoost ? (authorMultMap.get(item.authorKey || item.userId || `legacy:${item.id}`) ?? 1) : 1
                  const finalScore = fmt(eb.score * mult)
                  return (
                    <>
                      {/*
                      <div className="w-full px-3 py-1.5 border-b bg-muted/40 text-[10px] leading-snug font-mono text-muted-foreground">
                        <div>score = max(0, xpEB + gamma*clamp(consensus)) * (1 + beta*min(log1p(n), rcap)) * exp(-age/HL){authorBoost ? ' * authorMult' : ''}</div>
                        <div>score = max(0, {fmt(eb.finalXpAdj)} + {fmt(eb.consBonus)}) * {fmt(eb.reviewsMult)} * exp(-{fmt(eb.age)}/{fmt(eb.HL)}){authorBoost ? ` * ${fmt(mult)}` : ''} = {finalScore}</div>
                      </div>
                      */}
                    </>
                  )
                }
                if (ranker === 'zscore') {
                  const xs = filtered.map((it) => it.finalXp ?? 0).sort((a,b)=>a-b)
                  const med = xs.length ? xs[Math.floor(xs.length/2)] : 0
                  const dev = xs.map(x => Math.abs(x - med)).sort((a,b)=>a-b)
                  const mad = dev.length ? dev[Math.floor(dev.length/2)] : 0
                  const z = ((item.finalXp ?? 0) - med) / (1.4826 * (mad || 1e-6))
                  const n = Math.max(0, item.reviewCount ?? 0)
                  const beta = r === 'all' ? 0.2 : 0.25
                  const reviewsMult = 1 + beta * Math.log1p(n)
                  const c = 5
                  const gamma = r === 'month' ? 0.25 : 0.2
                  const cons = Math.max(-c, Math.min(c, item.consensusScore ?? 0))
                  const consMult = 1 + gamma * (cons / c)
                  const hotness = Math.max(0, z) * consMult * reviewsMult
                  const ageH = Math.max(0, (Date.now() - new Date(item.createdAt).getTime())/3600000)
                  const tau = r === 'week' ? 1.5 : r === 'month' ? 1.6 : 1.7
                  const baseScore = hotness / Math.pow(ageH + 2, tau)
                  const mult = authorBoost ? (authorMultMap.get(item.authorKey || item.userId || `legacy:${item.id}`) ?? 1) : 1
                  const finalScore = fmt(baseScore * mult)
                  return (
                    <>
                      {/*
                      <div className="w-full px-3 py-1.5 border-b bg-muted/40 text-[10px] leading-snug font-mono text-muted-foreground">
                        <div>score = max(0, z) * (1 + gamma*cons_norm) * (1 + beta*log1p(n)) / (ageHours+2)^tau{authorBoost ? ' * authorMult' : ''}</div>
                        <div>score = max(0, {fmt(z)}) * {fmt(consMult)} * {fmt(reviewsMult)} / ({fmt(ageH)}+2)^{tau}{authorBoost ? ` * ${fmt(mult)}` : ''} = {finalScore}</div>
                      </div>
                      */}
                    </>
                  )
                }
                if (ranker === 'conf') {
                  const xs = filtered.map((it) => it.finalXp ?? 0)
                  const mean = xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0
                  const n = Math.max(0, item.reviewCount ?? 0)
                  const nCap = r === 'week' ? 12 : r === 'month' ? 15 : 20
                  const conf = Math.min(1, n / nCap)
                  const xpConf = conf * (item.finalXp ?? 0) + (1 - conf) * mean
                  const HL = r === 'week' ? 5 : r === 'month' ? 14 : 180
                  const c = 5
                  const gamma = r === 'month' ? 1.2 : 1.0
                  const consAdj = gamma * conf * Math.max(-c, Math.min(c, item.consensusScore ?? 0))
                  const age = Math.max(0, (Date.now() - new Date(item.createdAt).getTime())/86400000)
                  const decay = Math.exp(-age / HL)
                  const baseScore = Math.max(0, xpConf + consAdj) * decay
                  const mult = authorBoost ? (authorMultMap.get(item.authorKey || item.userId || `legacy:${item.id}`) ?? 1) : 1
                  const finalScore = fmt(baseScore * mult)
                  return (
                    <>
                      {/*
                      <div className="w-full px-3 py-1.5 border-b bg-muted/40 text-[10px] leading-snug font-mono text-muted-foreground">
                        <div>score = max(0, xp_conf + gamma*conf*consensus) * exp(-age/HL){authorBoost ? ' * authorMult' : ''}</div>
                        <div>score = max(0, {fmt(xpConf)} + {fmt(consAdj)}) * exp(-{fmt(age)}/{HL}){authorBoost ? ` * ${fmt(mult)}` : ''} = {finalScore}</div>
                      </div>
                      */}
                    </>
                  )
                }
                return null
              })()
            )}
            <FeaturedEmbed url={item.url} />
          </FeaturedCard>
        ))}
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        {/*
        <label className="inline-flex items-center gap-2">
          Ranker:
          <select
            value={ranker}
            onChange={(e) => setRanker(e.target.value as Ranker)}
            className="h-8 rounded-md border bg-background px-2 py-1 text-sm"
          >
            <option value="baseline">Baseline</option>
            <option value="eb">EB (shrinkage)</option>
            <option value="zscore">Z-Score (trending)</option>
            <option value="conf">Confidence-weighted</option>
          </select>
        </label>
        */}
        {/*
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={authorBoost} onChange={(e) => setAuthorBoost(e.target.checked)} />
          Author boost
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={autoTune} onChange={(e) => setAutoTune(e.target.checked)} />
          Auto tune (EB)
        </label>
        */}
      </div>
      <Tabs defaultValue="week" value={range} onValueChange={(v) => setRange(v as Range)} className="w-full space-y-6">
        <TabsList className="flex-wrap gap-2">
          <TabsTrigger value="week">This Week</TabsTrigger>
          <TabsTrigger value="month">This Month</TabsTrigger>
          <TabsTrigger value="all">All-time</TabsTrigger>
        </TabsList>
        <TabsContent value="week">{renderMasonry(data.week, 'week')}</TabsContent>
        <TabsContent value="month">{renderMasonry(data.month, 'month')}</TabsContent>
        <TabsContent value="all">{renderMasonry(data.all, 'all')}</TabsContent>
      </Tabs>
    </div>
  )
}
