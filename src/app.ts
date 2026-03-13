import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from '@hono/node-server/serve-static'
import { dataService } from './data-service.js'
import { getMainHTML } from './ui.js'

const app = new Hono()

// CORS for API
app.use('/api/*', cors())

// Static files - root relative to CWD (project root on Railway)
app.use('/static/*', serveStatic({ root: 'public' }))

// Favicon
app.get('/favicon.ico', (c) => c.body(null, 204))

// ============ API ROUTES ============

app.get('/api/health', (c) => {
  const stats = dataService.getStats()
  return c.json({ status: 'ok', ...stats })
})

app.get('/api/equipment', (c) => {
  return c.json({ equipment: dataService.getEquipmentList() })
})

// Main analysis: keyword → matched equipment → Top10 groups
app.post('/api/analyze', async (c) => {
  const body = await c.req.json<{ keyword: string }>()
  const keyword = (body.keyword || '').trim()
  if (!keyword) return c.json({ error: '키워드를 입력해주세요.' }, 400)

  const result = dataService.analyze(keyword)
  return c.json(result)
})

// Drill-down: get actual cases for a specific group
app.post('/api/drilldown', async (c) => {
  const body = await c.req.json<{
    대상설비: string; 개선구분: string; 행위_표준: string; limit?: number
  }>()
  const result = dataService.drilldown(body.대상설비, body.개선구분, body.행위_표준, body.limit || 40)
  return c.json(result)
})

// Claude Insight generation
app.post('/api/insight', async (c) => {
  const body = await c.req.json<{ keyword: string; top10: any[] }>()
  const apiKey = process.env.ANTHROPIC_API_KEY || ''

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

    if (!response.ok) {
      console.error('Claude API error:', response.status, await response.text())
      return c.json({ insights: getDefaultInsights(body.keyword, body.top10) })
    }

    const result = await response.json() as any
    const text = result.content?.[0]?.text || ''
    try {
      const match = text.match(/\[[\s\S]*\]/)
      if (match) return c.json({ insights: JSON.parse(match[0]) })
    } catch {}
    return c.json({ insights: getDefaultInsights(body.keyword, body.top10) })
  } catch (err) {
    console.error('Insight error:', err)
    return c.json({ insights: getDefaultInsights(body.keyword, body.top10) })
  }
})

// Claude 1-line summaries
app.post('/api/summarize', async (c) => {
  const body = await c.req.json<{ cases: any[] }>()
  const apiKey = process.env.ANTHROPIC_API_KEY || ''

  if (!apiKey) {
    return c.json({ summaries: body.cases.map((cs: any) => generateLocalSummary(cs)) })
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

    if (!response.ok) return c.json({ summaries: body.cases.map((cs: any) => generateLocalSummary(cs)) })

    const result = await response.json() as any
    const text = result.content?.[0]?.text || ''
    try {
      const match = text.match(/\[[\s\S]*\]/)
      if (match) return c.json({ summaries: JSON.parse(match[0]) })
    } catch {}
    return c.json({ summaries: body.cases.map((cs: any) => generateLocalSummary(cs)) })
  } catch {
    return c.json({ summaries: body.cases.map((cs: any) => generateLocalSummary(cs)) })
  }
})

// ============ MAIN PAGE ============
app.get('/', (c) => c.html(getMainHTML()))

// ============ HELPERS ============

function generateLocalSummary(cs: any): string {
  const action = cs.행위_표준 || cs.개선활동명 || ''
  const saving = typeof cs.절감액 === 'number' ? cs.절감액.toFixed(1) : cs.절감액 || '0'
  return `${cs.대상설비 || ''} ${action}으로 연 ${saving}백만원 절감`
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
카드 3: "확산 전략 vs 고효율 전략" - 사례수 기반(확산) vs 평균 절감액(고효율)
카드 4: "추가 탐색 추천" - 연관 키워드나 설비 제안

icon 필드: FontAwesome 아이콘 클래스명 (예: "fas fa-chart-line")
content: 2~3문장 핵심 인사이트
evidence: 근거 데이터 구체적으로 명시

반드시 JSON 배열만 반환. 마크다운/설명 없이 순수 JSON만 출력.`
}

function getDefaultInsights(keyword: string, top10: any[]): any[] {
  if (!top10 || top10.length === 0) return []
  const top3 = top10.slice(0, 3)
  const avgSaving = top10.reduce((s: number, r: any) => s + (r.절감액_평균 || 0), 0) / top10.length
  const avgPayback = top10.reduce((s: number, r: any) => s + (r.투자비회수기간_평균 || 0), 0) / top10.length
  const maxCases = top10.reduce((m: any, r: any) => (r.사례수 || 0) > (m.사례수 || 0) ? r : m, top10[0])
  const maxSaving = top10[0]

  return [
    {
      title: "절감액(평균) 상위 패턴 3가지",
      icon: "fas fa-chart-bar",
      content: `상위 3개 패턴은 ${top3.map((r: any) => `"${r.행위_표준}(${r.개선구분})"`).join(', ')}입니다. 평균 절감액은 각각 ${top3.map((r: any) => `${(r.절감액_평균 || 0).toFixed(1)}백만원`).join(', ')}으로, 공통적으로 ${keyword} 설비의 운전 최적화 및 효율 개선에 초점을 맞추고 있습니다.`,
      evidence: `Top 3 그룹: ${top3.map((r: any) => `${r.행위_표준}=${(r.절감액_평균 || 0).toFixed(1)}백만원`).join(', ')}`
    },
    {
      title: "회수기간/투자비 관점 실행 우선순위",
      icon: "fas fa-clock",
      content: `Top 10 평균 투자비 회수기간은 ${avgPayback.toFixed(1)}년입니다. 빠른 회수가 가능한 항목 우선 실행으로 초기 성과를 확보하세요. 전체 평균 절감액은 ${avgSaving.toFixed(1)}백만원입니다.`,
      evidence: `평균 회수기간: ${avgPayback.toFixed(1)}년, 평균 절감액: ${avgSaving.toFixed(1)}백만원`
    },
    {
      title: "확산 전략 vs 고효율 전략",
      icon: "fas fa-balance-scale",
      content: `사례수 최다 그룹은 "${maxCases.행위_표준}"(${maxCases.사례수}건)으로 확산 적용이 용이합니다. 반면 절감액 최고 그룹은 "${maxSaving.행위_표준}"(평균 ${(maxSaving.절감액_평균 || 0).toFixed(1)}백만원)으로 고효율 전략에 적합합니다.`,
      evidence: `최다 사례: ${maxCases.행위_표준}(${maxCases.사례수}건), 최고 절감: ${maxSaving.행위_표준}(${(maxSaving.절감액_평균 || 0).toFixed(1)}백만원)`
    },
    {
      title: "추가 탐색 추천",
      icon: "fas fa-lightbulb",
      content: `"${keyword}" 관련 분석을 기반으로, 유사 설비군이나 연관 개선활동을 추가 탐색하면 더 넓은 절감 기회를 발견할 수 있습니다. 특히 사례수가 적지만 절감액이 높은 니치 영역에 주목하세요.`,
      evidence: `Top 10 내 설비: ${[...new Set(top10.map((r: any) => r.대상설비))].join(', ')}`
    }
  ]
}

export default app
