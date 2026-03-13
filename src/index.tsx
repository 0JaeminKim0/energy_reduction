import { Hono } from 'hono'
import { cors } from 'hono/cors'
import aggregatedData from './data_aggregated.json'
import equipmentAliases from './equipment_aliases.json'
import equipMapData from './equip_map.json'

type Bindings = {
  ANTHROPIC_API_KEY?: string
  ASSETS: { fetch: (req: Request) => Promise<Response> }
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())

// Favicon handler
app.get('/favicon.ico', (c) => {
  return c.body(null, 204)
})

// ============ DATA STRUCTURES ============

const IDX = {
  업종: 0, 대상설비: 1, 개선구분: 2, 개선활동명: 3,
  투자비회수기간: 4, 절감액: 5, 투자비: 6, 진단연도: 7,
  온실가스감축량: 8, 행위_표준: 9, 에너지절감종류: 10,
  에너지절감량_연료: 11, 에너지절감량_전력: 12
} as const

const aggData = aggregatedData as Array<{
  e: string; i: string; a: string; n: number;
  s: number; v: number; p: number; c: number; j: string;
}>
const aliases = equipmentAliases as Record<string, string[]>
const equipMap = equipMapData as Record<string, string>

// Build unique equipment list from aggregated data
const equipmentList = [...new Set(aggData.map(g => g.e).filter(Boolean))]

// ============ FUZZY MATCHING ============

function normalizeStr(s: string): string {
  return s.toLowerCase().replace(/[\s\-_&\/()]/g, '').trim()
}

function matchEquipment(keyword: string): Array<{ name: string; score: number }> {
  const kw = normalizeStr(keyword)
  const kwLower = keyword.toLowerCase().trim()
  const results: Array<{ name: string; score: number }> = []

  for (const equip of equipmentList) {
    let score = 0
    const equipNorm = normalizeStr(equip)
    const equipLower = equip.toLowerCase()

    if (equipNorm === kw) { score = 100 }
    else if (equipNorm.includes(kw) || kw.includes(equipNorm)) { score = 80 }
    else if (equipLower.split(/[\s&\/\-]+/).some(w => w.startsWith(kwLower) || kwLower.startsWith(w))) { score = 60 }

    const eqAliases = aliases[equip] || []
    for (const alias of eqAliases) {
      const aliasNorm = normalizeStr(alias)
      if (aliasNorm === kw) { score = Math.max(score, 95) }
      else if (aliasNorm.includes(kw) || kw.includes(aliasNorm)) { score = Math.max(score, 75) }
      else if (alias.toLowerCase().split(/[\s&\/\-]+/).some(w =>
        w.toLowerCase().startsWith(kwLower) || kwLower.startsWith(w.toLowerCase())
      )) { score = Math.max(score, 55) }
    }

    if (score === 0 && kw.length >= 2) {
      const kwGrams = new Set<string>()
      for (let i = 0; i < kw.length - 1; i++) kwGrams.add(kw.substring(i, i + 2))
      const eqGrams = new Set<string>()
      for (let i = 0; i < equipNorm.length - 1; i++) eqGrams.add(equipNorm.substring(i, i + 2))
      let overlap = 0
      for (const g of kwGrams) if (eqGrams.has(g)) overlap++
      const similarity = overlap / Math.max(kwGrams.size, eqGrams.size)
      if (similarity > 0.3) score = Math.round(35 * similarity)

      for (const alias of eqAliases) {
        const aliasGrams = new Set<string>()
        const aliasNorm2 = normalizeStr(alias)
        for (let i = 0; i < aliasNorm2.length - 1; i++) aliasGrams.add(aliasNorm2.substring(i, i + 2))
        let aliasOverlap = 0
        for (const g of kwGrams) if (aliasGrams.has(g)) aliasOverlap++
        const aliasSim = aliasOverlap / Math.max(kwGrams.size, aliasGrams.size)
        if (aliasSim > 0.3) score = Math.max(score, Math.round(35 * aliasSim))
      }
    }

    if (score > 0) results.push({ name: equip, score })
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, 10)
}

// ============ LOAD EQUIPMENT DATA (from static files) ============

async function loadEquipmentCases(equipName: string, baseUrl: string): Promise<any[][]> {
  const hash = equipMap[equipName]
  if (!hash) return []

  try {
    const url = `${baseUrl}/static/data/${hash}.json`
    const res = await fetch(url)
    if (!res.ok) return []
    return await res.json() as any[][]
  } catch {
    return []
  }
}

// ============ API ROUTES ============

app.get('/api/health', (c) => c.json({ status: 'ok', groups: aggData.length, equipment: equipmentList.length }))

app.get('/api/equipment', (c) => c.json({ equipment: equipmentList.sort() }))

// Main analysis endpoint
app.post('/api/analyze', async (c) => {
  const body = await c.req.json<{ keyword: string }>()
  const keyword = (body.keyword || '').trim()
  if (!keyword) return c.json({ error: '키워드를 입력해주세요.' }, 400)

  const matched = matchEquipment(keyword)
  if (matched.length === 0) {
    return c.json({ keyword, matched_equipment: [], top10: [], message: `"${keyword}"와(과) 일치하는 대상설비를 찾을 수 없습니다.` })
  }

  const threshold = 30
  let selectedEquipment = matched.filter(m => m.score >= threshold)
  if (selectedEquipment.length === 0) selectedEquipment = matched.slice(0, 3)
  const equipNames = new Set(selectedEquipment.map(m => m.name))

  const filtered = aggData.filter(g => equipNames.has(g.e))
  filtered.sort((a, b) => b.s - a.s)

  const top10 = filtered.slice(0, 10).map((g, idx) => ({
    rank: idx + 1,
    대상설비: g.e,
    개선구분: g.i,
    행위_표준: g.a,
    사례수: g.n,
    절감액_평균: g.s,
    투자비_평균: g.v,
    투자비회수기간_평균: g.p,
    CO2감축량_평균: g.c,
    업종: g.j
  }))

  return c.json({ keyword, matched_equipment: selectedEquipment, total_filtered_groups: filtered.length, top10 })
})

// Drill-down endpoint
app.post('/api/drilldown', async (c) => {
  const body = await c.req.json<{ 대상설비: string; 개선구분: string; 행위_표준: string; limit?: number }>()
  const { 대상설비, 개선구분, 행위_표준 } = body
  const limit = body.limit || 40

  const baseUrl = new URL(c.req.url).origin
  const allCases = await loadEquipmentCases(대상설비, baseUrl)

  const cases = allCases
    .filter(r => r[IDX.개선구분] === 개선구분 && r[IDX.행위_표준] === 행위_표준)
    .sort((a, b) => (b[IDX.절감액] as number) - (a[IDX.절감액] as number))
    .slice(0, limit)
    .map(r => ({
      업종: r[IDX.업종],
      대상설비: r[IDX.대상설비],
      개선구분: r[IDX.개선구분],
      개선활동명: r[IDX.개선활동명],
      투자비회수기간: r[IDX.투자비회수기간],
      절감액: r[IDX.절감액],
      투자비: r[IDX.투자비],
      진단연도: r[IDX.진단연도],
      온실가스감축량: r[IDX.온실가스감축량],
      행위_표준: r[IDX.행위_표준],
      에너지절감종류: r[IDX.에너지절감종류],
      에너지절감량_연료: r[IDX.에너지절감량_연료],
      에너지절감량_전력: r[IDX.에너지절감량_전력]
    }))

  return c.json({ group: { 대상설비, 개선구분, 행위_표준 }, total: cases.length, cases })
})

// Claude Insight generation
app.post('/api/insight', async (c) => {
  const body = await c.req.json<{ keyword: string; top10: any[] }>()
  const apiKey = c.env?.ANTHROPIC_API_KEY || ''

  if (!apiKey) {
    return c.json({ insights: getDefaultInsights(body.keyword, body.top10) })
  }

  try {
    const prompt = buildInsightPrompt(body.keyword, body.top10)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (!response.ok) return c.json({ insights: getDefaultInsights(body.keyword, body.top10) })

    const result = await response.json() as any
    const text = result.content?.[0]?.text || ''
    try {
      const match = text.match(/\[[\s\S]*\]/)
      if (match) return c.json({ insights: JSON.parse(match[0]) })
    } catch {}
    return c.json({ insights: getDefaultInsights(body.keyword, body.top10) })
  } catch {
    return c.json({ insights: getDefaultInsights(body.keyword, body.top10) })
  }
})

// Claude 1-line summaries
app.post('/api/summarize', async (c) => {
  const body = await c.req.json<{ cases: any[] }>()
  const apiKey = c.env?.ANTHROPIC_API_KEY || ''

  if (!apiKey) {
    return c.json({ summaries: body.cases.map(cs => generateLocalSummary(cs)) })
  }

  try {
    const casesText = body.cases.map((cs: any, i: number) =>
      `[${i + 1}] 설비:${cs.대상설비} | 개선:${cs.개선구분} | 행위:${cs.행위_표준} | 활동:${cs.개선활동명} | 절감액:${cs.절감액}백만원 | 투자비:${cs.투자비}백만원 | CO2:${cs.온실가스감축량}tCO2`
    ).join('\n')

    const prompt = `아래 에너지 절감 사례들을 각각 한 줄(15~30자)로 요약하세요. 핵심 행위와 효과를 포함하세요.\nJSON 배열로 반환: ["요약1", "요약2", ...]\n\n사례 목록:\n${casesText}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
    })

    if (!response.ok) return c.json({ summaries: body.cases.map(cs => generateLocalSummary(cs)) })

    const result = await response.json() as any
    const text = result.content?.[0]?.text || ''
    try {
      const match = text.match(/\[[\s\S]*\]/)
      if (match) return c.json({ summaries: JSON.parse(match[0]) })
    } catch {}
    return c.json({ summaries: body.cases.map(cs => generateLocalSummary(cs)) })
  } catch {
    return c.json({ summaries: body.cases.map(cs => generateLocalSummary(cs)) })
  }
})

// ============ HELPERS ============

function generateLocalSummary(cs: any): string {
  return `${cs.대상설비 || ''} ${cs.행위_표준 || cs.개선활동명 || ''}으로 연 ${(cs.절감액 || 0).toFixed?.(1) || cs.절감액}백만원 절감`
}

function buildInsightPrompt(keyword: string, top10: any[]): string {
  const tableStr = top10.map((r: any, i: number) =>
    `${i + 1}. [${r.대상설비}] ${r.개선구분} > ${r.행위_표준} | 절감액평균: ${r.절감액_평균}백만원 | 사례수: ${r.사례수} | 투자비평균: ${r.투자비_평균}백만원 | 회수기간: ${r.투자비회수기간_평균}년 | CO2: ${r.CO2감축량_평균}tCO2`
  ).join('\n')

  return `당신은 에너지 절감 전문 컨설턴트입니다. 아래 "${keyword}" 관련 설비의 절감액(평균) Top 10 분석 결과를 바탕으로 전략적 인사이트를 생성하세요.

=== Top 10 분석 결과 ===
${tableStr}

아래 4개 카드를 JSON 배열로 생성하세요. 각 카드는 {"title": "...", "icon": "...", "content": "...", "evidence": "..."} 형식입니다.

카드 1: "절감액(평균) 상위 패턴 3가지" - 공통 행동/설비/개선구분의 패턴을 분석
카드 2: "회수기간/투자비 관점 리스크 & 실행 우선순위" - 투자 대비 효율 분석
카드 3: "확산 전략 vs 고효율 전략" - 사례수 기반(확산 가능성) vs 평균 절감액 기반(고효율)
카드 4: "추가 탐색 추천" - 연관 키워드나 설비 제안

icon 필드는 FontAwesome 아이콘 클래스명을 사용하세요 (예: "fas fa-chart-line").
content는 2~3문장으로 핵심 인사이트를 작성하세요.
evidence는 근거가 되는 데이터를 구체적으로 명시하세요.

반드시 JSON 배열만 반환하세요. 마크다운이나 설명 없이 순수 JSON만 출력하세요.`
}

function getDefaultInsights(keyword: string, top10: any[]): any[] {
  if (!top10 || top10.length === 0) return []
  const top3 = top10.slice(0, 3)
  const avgSaving = top10.reduce((s: number, r: any) => s + r.절감액_평균, 0) / top10.length
  const avgPayback = top10.reduce((s: number, r: any) => s + r.투자비회수기간_평균, 0) / top10.length
  const maxCases = top10.reduce((m: any, r: any) => r.사례수 > m.사례수 ? r : m, top10[0])
  const maxSaving = top10[0]

  return [
    {
      title: "절감액(평균) 상위 패턴 3가지",
      icon: "fas fa-chart-bar",
      content: `상위 3개 패턴은 ${top3.map((r: any) => `"${r.행위_표준}(${r.개선구분})"`).join(', ')}입니다. 평균 절감액은 각각 ${top3.map((r: any) => `${r.절감액_평균}백만원`).join(', ')}으로, 공통적으로 ${keyword} 설비의 운전 최적화 및 효율 개선에 초점을 맞추고 있습니다.`,
      evidence: `Top 3 그룹의 절감액 평균: ${top3.map((r: any) => `${r.행위_표준}=${r.절감액_평균}백만원`).join(', ')}`
    },
    {
      title: "회수기간/투자비 관점 실행 우선순위",
      icon: "fas fa-clock",
      content: `Top 10 평균 투자비 회수기간은 ${avgPayback.toFixed(1)}년입니다. 특히 빠른 회수가 가능한 항목을 우선 실행하면 초기 성과를 빠르게 확보할 수 있습니다. 전체 평균 절감액은 ${avgSaving.toFixed(1)}백만원입니다.`,
      evidence: `평균 회수기간: ${avgPayback.toFixed(1)}년, 평균 절감액: ${avgSaving.toFixed(1)}백만원`
    },
    {
      title: "확산 전략 vs 고효율 전략",
      icon: "fas fa-balance-scale",
      content: `사례수 최다 그룹은 "${maxCases.행위_표준}"(${maxCases.사례수}건)으로 확산 적용이 용이합니다. 반면 절감액 최고 그룹은 "${maxSaving.행위_표준}"(평균 ${maxSaving.절감액_평균}백만원)으로 고효율 전략에 적합합니다.`,
      evidence: `최다 사례: ${maxCases.행위_표준}(${maxCases.사례수}건), 최고 절감: ${maxSaving.행위_표준}(${maxSaving.절감액_평균}백만원)`
    },
    {
      title: "추가 탐색 추천",
      icon: "fas fa-lightbulb",
      content: `"${keyword}" 관련 분석을 기반으로, 유사 설비군이나 연관 개선활동을 추가 탐색하면 더 넓은 절감 기회를 발견할 수 있습니다. 특히 사례수가 적지만 절감액이 높은 니치 영역에 주목하세요.`,
      evidence: `Top 10 내 설비: ${[...new Set(top10.map((r: any) => r.대상설비))].join(', ')}`
    }
  ]
}

// ============ MAIN PAGE ============
app.get('/', (c) => c.html(getMainHTML()))

function getMainHTML(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>설비 키워드 기반 정량 분석 PoC</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { sans: ['Noto Sans KR', 'sans-serif'] },
          colors: {
            primary: { 50:'#eff6ff',100:'#dbeafe',200:'#bfdbfe',300:'#93c5fd',400:'#60a5fa',500:'#3b82f6',600:'#2563eb',700:'#1d4ed8',800:'#1e40af',900:'#1e3a8a' },
            accent: { 50:'#f0fdf4',100:'#dcfce7',200:'#bbf7d0',300:'#86efac',400:'#4ade80',500:'#22c55e',600:'#16a34a' }
          }
        }
      }
    }
  </script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Noto Sans KR', sans-serif; }
    @keyframes fadeInUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
    @keyframes fadeIn { from{opacity:0} to{opacity:1} }
    @keyframes shimmer { 0%{background-position:-200px 0} 100%{background-position:calc(200px + 100%) 0} }
    @keyframes checkmark { 0%{transform:scale(0)} 50%{transform:scale(1.2)} 100%{transform:scale(1)} }
    .fade-in-up { animation: fadeInUp 0.5s ease-out forwards; }
    .fade-in { animation: fadeIn 0.4s ease-out forwards; }
    .skeleton { background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%); background-size:200px 100%; animation:shimmer 1.5s infinite; border-radius:4px; }
    .step-check { animation: checkmark 0.3s ease-out forwards; }

    .drawer-overlay { position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:40;opacity:0;transition:opacity 0.3s;pointer-events:none; }
    .drawer-overlay.active { opacity:1;pointer-events:auto; }
    .drawer { position:fixed;top:0;right:0;bottom:0;width:min(680px,92vw);background:white;z-index:50;transform:translateX(100%);transition:transform 0.35s cubic-bezier(0.16,1,0.3,1);overflow-y:auto;box-shadow:-4px 0 24px rgba(0,0,0,0.12); }
    .drawer.open { transform:translateX(0); }

    .data-table { border-collapse:separate;border-spacing:0;width:100%; }
    .data-table th { position:sticky;top:0;z-index:10;background:#1e3a8a;color:white;padding:12px 14px;text-align:left;font-size:12px;font-weight:600;white-space:nowrap;letter-spacing:-0.01em; }
    .data-table td { padding:10px 14px;font-size:13px;border-bottom:1px solid #e5e7eb; }
    .data-table tbody tr:hover { background:#eff6ff; }
    .data-table tbody tr:nth-child(even) { background:#f8fafc; }
    .data-table tbody tr:nth-child(even):hover { background:#eff6ff; }

    .clickable-count { color:#2563eb;font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:2px; }
    .clickable-count:hover { color:#1d4ed8; }

    .chip { display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:500;background:#dbeafe;color:#1e40af;border:1px solid #bfdbfe; }
    .chip-score { font-size:11px;color:#60a5fa;margin-left:2px; }

    .insight-card { background:white;border-radius:12px;border:1px solid #e5e7eb;padding:20px;transition:all 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.04); }
    .insight-card:hover { box-shadow:0 4px 12px rgba(0,0,0,0.08);border-color:#93c5fd; }

    .case-item { border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:10px;transition:all 0.2s;background:white; }
    .case-item:hover { border-color:#93c5fd;box-shadow:0 2px 8px rgba(0,0,0,0.05); }
    .case-expand { max-height:0;overflow:hidden;transition:max-height 0.3s ease-out; }
    .case-expand.open { max-height:500px; }

    .search-wrap { position:relative;max-width:600px;margin:0 auto; }
    .search-wrap input { width:100%;padding:16px 56px 16px 20px;font-size:16px;border:2px solid #e5e7eb;border-radius:16px;outline:none;transition:all 0.2s;background:white;box-shadow:0 2px 8px rgba(0,0,0,0.04); }
    .search-wrap input:focus { border-color:#3b82f6;box-shadow:0 0 0 4px rgba(59,130,246,0.1),0 2px 8px rgba(0,0,0,0.04); }
    .search-btn { position:absolute;right:6px;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:12px;border:none;background:#2563eb;color:white;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;transition:background 0.2s; }
    .search-btn:hover { background:#1d4ed8; }
    .search-btn:disabled { background:#93c5fd;cursor:not-allowed; }

    .num-positive { color:#059669;font-weight:600; }
    .num-rank { display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;font-weight:700;font-size:13px; }
    .rank-1 { background:#fef3c7;color:#92400e; }
    .rank-2 { background:#e5e7eb;color:#374151; }
    .rank-3 { background:#fed7aa;color:#9a3412; }
    .rank-default { background:#f3f4f6;color:#6b7280; }

    .step-item { display:flex;align-items:center;gap:10px;padding:8px 0;font-size:14px;color:#6b7280; }
    .step-item.active { color:#2563eb;font-weight:500; }
    .step-item.done { color:#059669; }
    .step-icon { width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:12px; }
    .step-icon.pending { background:#f3f4f6;color:#9ca3af; }
    .step-icon.active { background:#dbeafe;color:#2563eb; }
    .step-icon.done { background:#dcfce7;color:#16a34a; }

    .suggest-chip { display:inline-block;padding:6px 16px;border-radius:20px;font-size:13px;background:#f8fafc;border:1px solid #e2e8f0;color:#475569;cursor:pointer;transition:all 0.2s; }
    .suggest-chip:hover { background:#eff6ff;border-color:#93c5fd;color:#1e40af; }
    ::-webkit-scrollbar { width:6px; }
    ::-webkit-scrollbar-track { background:transparent; }
    ::-webkit-scrollbar-thumb { background:#cbd5e1;border-radius:3px; }
    ::-webkit-scrollbar-thumb:hover { background:#94a3b8; }
  </style>
</head>
<body class="bg-gray-50 min-h-screen">
  <header class="bg-white border-b border-gray-200 sticky top-0 z-30">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center">
          <i class="fas fa-bolt text-white text-sm"></i>
        </div>
        <div>
          <h1 class="text-base font-bold text-gray-900 leading-tight">설비 키워드 기반 정량 분석</h1>
          <p class="text-xs text-gray-500">에너지 절감 사례 70,000+ 건 기반 PoC</p>
        </div>
      </div>
      <div class="text-xs text-gray-400 hidden sm:block"><i class="fas fa-database mr-1"></i>DB 2024 표준화 v4</div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 sm:px-6 py-8">
    <section id="search-section" class="mb-8">
      <div class="text-center mb-6">
        <h2 class="text-2xl font-bold text-gray-800 mb-2"><i class="fas fa-search text-primary-500 mr-2"></i>설비 키워드를 입력하세요</h2>
        <p class="text-sm text-gray-500">대상 설비명(한글/영문)을 입력하면 절감액 기준 Top 10 분석이 시작됩니다</p>
      </div>
      <div class="search-wrap">
        <input type="text" id="keyword-input" placeholder="예: 보일러, 펌프, Air Compressor, 조명..." autocomplete="off" />
        <button class="search-btn" id="search-btn" onclick="startAnalysis()"><i class="fas fa-arrow-right"></i></button>
      </div>
      <div class="flex flex-wrap gap-2 justify-center mt-4">
        <span class="suggest-chip" onclick="quickSearch('보일러')">보일러</span>
        <span class="suggest-chip" onclick="quickSearch('펌프')">펌프</span>
        <span class="suggest-chip" onclick="quickSearch('Air Compressor')">Air Compressor</span>
        <span class="suggest-chip" onclick="quickSearch('조명')">조명</span>
        <span class="suggest-chip" onclick="quickSearch('모터')">모터</span>
        <span class="suggest-chip" onclick="quickSearch('열교환기')">열교환기</span>
        <span class="suggest-chip" onclick="quickSearch('칠러')">칠러</span>
        <span class="suggest-chip" onclick="quickSearch('HVAC')">HVAC</span>
      </div>
    </section>

    <section id="progress-section" class="hidden mb-8">
      <div class="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm max-w-lg mx-auto">
        <div class="flex items-center gap-3 mb-5">
          <div class="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
            <i class="fas fa-cog fa-spin text-primary-600 text-sm" id="progress-spinner"></i>
          </div>
          <div>
            <h3 class="text-base font-semibold text-gray-800">분석 진행 중</h3>
            <p class="text-xs text-gray-500" id="progress-keyword"></p>
          </div>
        </div>
        <div id="progress-steps">
          <div class="step-item" id="step-1"><div class="step-icon pending"><i class="fas fa-circle text-[8px]"></i></div><span>대상설비 유사도 매칭 중...</span></div>
          <div class="step-item" id="step-2"><div class="step-icon pending"><i class="fas fa-circle text-[8px]"></i></div><span>절감액(평균) 집계 및 Top 10 추출 중...</span></div>
          <div class="step-item" id="step-3"><div class="step-icon pending"><i class="fas fa-circle text-[8px]"></i></div><span>전략적 Insight 생성 중...</span></div>
        </div>
      </div>
    </section>

    <div id="results-section" class="hidden space-y-8">
      <section id="chips-section" class="fade-in-up" style="opacity:0">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold text-gray-600 mr-1"><i class="fas fa-microchip text-primary-500 mr-1"></i>매칭된 설비:</span>
          <div id="equipment-chips" class="flex flex-wrap gap-2"></div>
        </div>
      </section>

      <section id="table-section" style="opacity:0">
        <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 class="text-base font-bold text-gray-800"><i class="fas fa-trophy text-amber-500 mr-2"></i>절감액(평균) Top 10</h3>
              <p class="text-xs text-gray-500 mt-0.5" id="table-subtitle"></p>
            </div>
            <div class="text-xs text-gray-400"><i class="fas fa-sort-amount-down mr-1"></i>절감액(평균) 내림차순</div>
          </div>
          <div class="overflow-x-auto">
            <table class="data-table" id="top10-table">
              <thead><tr>
                <th>#</th><th>대상설비</th><th>업종</th><th>개선구분</th><th>행위(표준)</th>
                <th class="text-center">사례수</th><th class="text-right">회수기간(년)</th>
                <th class="text-right">투자비(백만)</th><th class="text-right">CO2(tCO2)</th>
                <th class="text-right">절감액(평균,백만)</th>
              </tr></thead>
              <tbody id="top10-body"></tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="insight-section" style="opacity:0">
        <div class="flex items-center gap-2 mb-4">
          <h3 class="text-base font-bold text-gray-800"><i class="fas fa-brain text-purple-500 mr-2"></i>전략적 Insight</h3>
          <span class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full" id="insight-badge">AI 생성</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="insight-cards"></div>
      </section>
    </div>
  </main>

  <div class="drawer-overlay" id="drawer-overlay" onclick="closeDrawer()"></div>
  <div class="drawer" id="drawer">
    <div class="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-base font-bold text-gray-800" id="drawer-title">Drill-down 사례</h3>
          <p class="text-xs text-gray-500 mt-0.5" id="drawer-subtitle"></p>
        </div>
        <button onclick="closeDrawer()" class="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
      </div>
    </div>
    <div class="p-5" id="drawer-content"></div>
  </div>

  <script>
    let currentTop10=[], currentKeyword='', isAnalyzing=false;
    const keywordInput=document.getElementById('keyword-input');
    keywordInput.addEventListener('keydown',e=>{if(e.key==='Enter'&&!isAnalyzing)startAnalysis()});

    function quickSearch(kw){keywordInput.value=kw;startAnalysis()}

    async function startAnalysis(){
      const keyword=keywordInput.value.trim();
      if(!keyword||isAnalyzing)return;
      isAnalyzing=true; currentKeyword=keyword;
      const btn=document.getElementById('search-btn'); btn.disabled=true;
      hideAllResults(); showProgress(keyword);

      try{
        await activateStep(1); await sleep(300);
        const res=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword})});
        const data=await res.json();
        if(!data.top10||data.top10.length===0){completeStep(1);showNoResults(keyword,data.message||'결과 없음');return}
        completeStep(1); currentTop10=data.top10;

        await activateStep(2); await sleep(200);
        renderEquipmentChips(data.matched_equipment);
        renderTop10Table(data.top10,data.total_filtered_groups);
        completeStep(2);

        await activateStep(3);
        const insightRes=await fetch('/api/insight',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword,top10:data.top10})});
        const insightData=await insightRes.json();
        renderInsights(insightData.insights||[]);
        completeStep(3);

        completeProgress();
      }catch(err){console.error('Analysis error:',err);alert('분석 중 오류: '+err.message)}
      finally{isAnalyzing=false;btn.disabled=false}
    }

    function showProgress(keyword){
      document.getElementById('progress-section').classList.remove('hidden');
      document.getElementById('progress-keyword').textContent='"'+keyword+'" 분석 중...';
      for(let i=1;i<=3;i++){const s=document.getElementById('step-'+i);s.className='step-item';s.querySelector('.step-icon').className='step-icon pending';s.querySelector('.step-icon').innerHTML='<i class="fas fa-circle text-[8px]"></i>'}
      document.getElementById('progress-spinner').className='fas fa-cog fa-spin text-primary-600 text-sm';
    }
    async function activateStep(n){const s=document.getElementById('step-'+n);s.className='step-item active';s.querySelector('.step-icon').className='step-icon active';s.querySelector('.step-icon').innerHTML='<i class="fas fa-spinner fa-spin text-xs"></i>'}
    function completeStep(n){const s=document.getElementById('step-'+n);s.className='step-item done';s.querySelector('.step-icon').className='step-icon done step-check';s.querySelector('.step-icon').innerHTML='<i class="fas fa-check text-xs"></i>'}
    function completeProgress(){
      document.getElementById('progress-spinner').className='fas fa-check-circle text-green-600 text-sm';
      document.getElementById('progress-keyword').textContent='분석 완료!';
      setTimeout(()=>document.getElementById('progress-section').classList.add('hidden'),1200);
    }
    function hideAllResults(){document.getElementById('results-section').classList.add('hidden');['chips-section','table-section','insight-section'].forEach(id=>document.getElementById(id).style.opacity='0')}
    function showNoResults(keyword,message){
      document.getElementById('results-section').classList.remove('hidden');
      document.getElementById('chips-section').style.opacity='1';document.getElementById('chips-section').className='fade-in-up';
      document.getElementById('equipment-chips').innerHTML='<span class="text-sm text-gray-500">'+escapeHtml(message)+'</span>';
      setTimeout(()=>document.getElementById('progress-section').classList.add('hidden'),800);
      isAnalyzing=false;document.getElementById('search-btn').disabled=false;
    }

    function renderEquipmentChips(matched){
      document.getElementById('equipment-chips').innerHTML=matched.map(m=>'<span class="chip">'+escapeHtml(m.name)+'<span class="chip-score">'+m.score+'%</span></span>').join('');
      document.getElementById('results-section').classList.remove('hidden');
      requestAnimationFrame(()=>{document.getElementById('chips-section').style.opacity='1';document.getElementById('chips-section').className='fade-in-up'});
    }

    function renderTop10Table(top10,totalGroups){
      const tbody=document.getElementById('top10-body');
      tbody.innerHTML=top10.map(r=>{
        const rc=r.rank<=3?'rank-'+r.rank:'rank-default';
        const ind=(r.업종||'').split('|').filter(Boolean);
        const indStr=ind.slice(0,2).join(', ')+(ind.length>2?' 외 '+(ind.length-2):'');
        const gjEncoded=btoa(unescape(encodeURIComponent(JSON.stringify({e:r.대상설비,i:r.개선구분,a:r.행위_표준,n:r.사례수}))));
        return '<tr>'+
          '<td><span class="num-rank '+rc+'">'+r.rank+'</span></td>'+
          '<td class="font-medium text-gray-800">'+escapeHtml(r.대상설비)+'</td>'+
          '<td class="text-gray-600 text-xs max-w-[120px] truncate" title="'+escapeHtml(r.업종)+'">'+escapeHtml(indStr)+'</td>'+
          '<td class="text-gray-600 text-xs">'+escapeHtml(r.개선구분)+'</td>'+
          '<td class="font-medium">'+escapeHtml(r.행위_표준)+'</td>'+
          '<td class="text-center"><span class="clickable-count" data-group="'+gjEncoded+'" onclick="openDrilldownB64(this.dataset.group)">'+r.사례수.toLocaleString()+'</span></td>'+
          '<td class="text-right">'+r.투자비회수기간_평균.toFixed(1)+'</td>'+
          '<td class="text-right">'+r.투자비_평균.toFixed(1)+'</td>'+
          '<td class="text-right">'+r.CO2감축량_평균.toFixed(1)+'</td>'+
          '<td class="text-right num-positive text-base">'+r.절감액_평균.toFixed(1)+'</td></tr>'
      }).join('');
      document.getElementById('table-subtitle').textContent='총 '+totalGroups+'개 그룹 중 상위 10개 (키워드: "'+currentKeyword+'")';
      setTimeout(()=>{document.getElementById('table-section').style.opacity='1';document.getElementById('table-section').className='fade-in-up'},200);
    }

    function renderInsights(insights){
      const container=document.getElementById('insight-cards');
      if(!insights||insights.length===0){container.innerHTML='<p class="text-gray-500 col-span-2 text-center py-8">인사이트 생성 실패</p>';return}
      const colors=['blue','amber','green','purple'];
      container.innerHTML=insights.map((ins,i)=>{
        const c=colors[i%colors.length];
        return '<div class="insight-card fade-in-up" style="animation-delay:'+(i*0.12)+'s;opacity:0">'+
          '<div class="flex items-start gap-3 mb-3"><div class="w-9 h-9 rounded-lg bg-'+c+'-100 flex items-center justify-center flex-shrink-0"><i class="'+(ins.icon||'fas fa-lightbulb')+' text-'+c+'-600 text-sm"></i></div>'+
          '<h4 class="text-sm font-bold text-gray-800 leading-tight pt-1">'+escapeHtml(ins.title)+'</h4></div>'+
          '<p class="text-sm text-gray-700 leading-relaxed mb-3">'+escapeHtml(ins.content)+'</p>'+
          '<div class="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2"><i class="fas fa-quote-left mr-1"></i>'+escapeHtml(ins.evidence||'')+'</div></div>'
      }).join('');
      setTimeout(()=>{document.getElementById('insight-section').style.opacity='1';document.getElementById('insight-section').className='fade-in-up'},400);
    }

    function openDrilldownB64(b64){const json=decodeURIComponent(escape(atob(b64)));openDrilldown(json)}
    function openDrilldown(groupJson){
      const group=typeof groupJson==='string'?JSON.parse(groupJson):groupJson;
      document.getElementById('drawer-title').textContent=group.e+' > '+group.a;
      document.getElementById('drawer-subtitle').textContent=group.i+' | 사례수: '+group.n+'건';
      document.getElementById('drawer-content').innerHTML='<div class="space-y-3">'+Array(5).fill(0).map(()=>'<div class="case-item"><div class="skeleton h-4 w-3/4 mb-2"></div><div class="skeleton h-3 w-1/2"></div></div>').join('')+'</div>';
      document.getElementById('drawer').classList.add('open');
      document.getElementById('drawer-overlay').classList.add('active');
      document.body.style.overflow='hidden';
      fetchDrilldown(group.e,group.i,group.a);
    }

    async function fetchDrilldown(equip,improve,action){
      try{
        const res=await fetch('/api/drilldown',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({대상설비:equip,개선구분:improve,행위_표준:action,limit:40})});
        const data=await res.json();
        renderDrilldownCases(data.cases||[]);
        if(data.cases&&data.cases.length>0)loadSummaries(data.cases);
      }catch(err){document.getElementById('drawer-content').innerHTML='<p class="text-red-500 text-center py-8">사례 로드 실패</p>'}
    }

    function renderDrilldownCases(cases){
      const content=document.getElementById('drawer-content');
      if(cases.length===0){content.innerHTML='<p class="text-gray-500 text-center py-8">해당 조건의 사례가 없습니다.</p>';return}
      content.innerHTML=cases.map((cs,i)=>{
        const s=typeof cs.절감액==='number'?cs.절감액:0;
        const inv=typeof cs.투자비==='number'?cs.투자비:0;
        const co2=typeof cs.온실가스감축량==='number'?cs.온실가스감축량:0;
        const pb=typeof cs.투자비회수기간==='number'?cs.투자비회수기간:0;
        return '<div class="case-item" id="case-'+i+'">'+
          '<div class="flex items-start justify-between mb-2"><div class="flex-1">'+
          '<div class="text-xs text-primary-600 font-medium mb-1" id="case-summary-'+i+'"><i class="fas fa-spinner fa-spin mr-1 text-gray-400"></i><span class="text-gray-400">요약 생성 중...</span></div>'+
          '<div class="flex items-center gap-2 flex-wrap">'+
          '<span class="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">'+escapeHtml(cs.업종||'')+'</span>'+
          '<span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">'+escapeHtml(cs.진단연도||'')+'</span>'+
          '</div></div><span class="num-positive text-sm whitespace-nowrap">'+s.toFixed(1)+'백만원</span></div>'+
          '<button onclick="toggleCase('+i+')" class="text-xs text-gray-500 hover:text-primary-600 flex items-center gap-1 mt-2"><i class="fas fa-chevron-down text-[10px] transition-transform" id="case-arrow-'+i+'" style="transition:transform 0.2s"></i>원문 펼치기</button>'+
          '<div class="case-expand" id="case-detail-'+i+'"><div class="bg-gray-50 rounded-lg p-3 mt-2 text-xs space-y-1.5">'+
          '<div><span class="text-gray-500 inline-block w-20">개선활동명:</span><span class="text-gray-800 font-medium">'+escapeHtml(cs.개선활동명||'')+'</span></div>'+
          '<div><span class="text-gray-500 inline-block w-20">행위(표준):</span><span>'+escapeHtml(cs.행위_표준||'')+'</span></div>'+
          '<div><span class="text-gray-500 inline-block w-20">개선구분:</span><span>'+escapeHtml(cs.개선구분||'')+'</span></div>'+
          '<div class="flex gap-4 pt-1 border-t border-gray-200 mt-1">'+
          '<span><i class="fas fa-coins text-amber-500 mr-1"></i>투자비: '+inv.toFixed(1)+'백만원</span>'+
          '<span><i class="fas fa-clock text-blue-500 mr-1"></i>회수: '+pb.toFixed(1)+'년</span>'+
          '<span><i class="fas fa-leaf text-green-500 mr-1"></i>CO2: '+co2.toFixed(1)+'tCO2</span></div>'+
          '<div class="flex gap-4"><span><i class="fas fa-fire text-orange-500 mr-1"></i>연료: '+(cs.에너지절감량_연료||0).toFixed(1)+'toe</span>'+
          '<span><i class="fas fa-bolt text-yellow-500 mr-1"></i>전력: '+(cs.에너지절감량_전력||0).toFixed(1)+'toe</span></div>'+
          '</div></div></div>'
      }).join('');
    }

    function toggleCase(i){const d=document.getElementById('case-detail-'+i);const a=document.getElementById('case-arrow-'+i);d.classList.toggle('open');a.style.transform=d.classList.contains('open')?'rotate(180deg)':''}

    async function loadSummaries(cases){
      const bs=10;
      for(let start=0;start<cases.length;start+=bs){
        const batch=cases.slice(start,start+bs);
        try{
          const res=await fetch('/api/summarize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cases:batch})});
          const data=await res.json();
          if(data.summaries)data.summaries.forEach((s,j)=>{const el=document.getElementById('case-summary-'+(start+j));if(el)el.innerHTML='<i class="fas fa-wand-magic-sparkles text-amber-500 mr-1"></i>'+escapeHtml(s)})
        }catch(e){batch.forEach((cs,j)=>{const el=document.getElementById('case-summary-'+(start+j));if(el){const s=(cs.대상설비||'')+' '+(cs.행위_표준||'')+'으로 연 '+(cs.절감액||0).toFixed(1)+'백만원 절감';el.innerHTML='<i class="fas fa-wand-magic-sparkles text-amber-500 mr-1"></i>'+escapeHtml(s)}})}
      }
    }

    function closeDrawer(){document.getElementById('drawer').classList.remove('open');document.getElementById('drawer-overlay').classList.remove('active');document.body.style.overflow=''}
    function escapeHtml(str){if(!str)return '';return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
    function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
  </script>
</body>
</html>`
}

export default app
