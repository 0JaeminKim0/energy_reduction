import fs from 'node:fs'
import path from 'node:path'

// Use process.cwd() for Railway compatibility (always project root)
const ROOT = process.cwd()

// ============ TYPES ============
interface AggGroup {
  e: string  // 대상설비
  i: string  // 개선구분
  a: string  // 행위_표준
  n: number  // 사례수
  s: number  // 절감액_평균
  v: number  // 투자비_평균
  p: number  // 투자비회수기간_평균
  c: number  // CO2감축량_평균
  j: string  // 업종들 (|로 구분)
}

// Compact data indices
const IDX = {
  업종: 0, 대상설비: 1, 개선구분: 2, 개선활동명: 3,
  투자비회수기간: 4, 절감액: 5, 투자비: 6, 진단연도: 7,
  온실가스감축량: 8, 행위_표준: 9, 에너지절감종류: 10,
  에너지절감량_연료: 11, 에너지절감량_전력: 12
} as const

// ============ DATA LOADING ============
function loadJSON<T>(filePath: string): T {
  const fullPath = path.join(ROOT, filePath)
  const raw = fs.readFileSync(fullPath, 'utf-8')
  return JSON.parse(raw) as T
}

const aggData: AggGroup[] = loadJSON('src/data_aggregated.json')
const aliases: Record<string, string[]> = loadJSON('src/equipment_aliases.json')
const equipMap: Record<string, string> = loadJSON('src/equip_map.json')

// Build unique equipment list
const equipmentList = [...new Set(aggData.map(g => g.e).filter(Boolean))].sort()

console.log(`Data loaded: ${aggData.length} groups, ${equipmentList.length} equipment types`)

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

    // Exact match
    if (equipNorm === kw) score = 100
    // Contains
    else if (equipNorm.includes(kw) || kw.includes(equipNorm)) score = 80
    // Word prefix
    else if (equip.toLowerCase().split(/[\s&\/\-]+/).some(w => w.startsWith(kwLower) || kwLower.startsWith(w))) score = 60

    // Alias matching
    const eqAliases = aliases[equip] || []
    for (const alias of eqAliases) {
      const aliasNorm = normalizeStr(alias)
      if (aliasNorm === kw) score = Math.max(score, 95)
      else if (aliasNorm.includes(kw) || kw.includes(aliasNorm)) score = Math.max(score, 75)
      else if (alias.toLowerCase().split(/[\s&\/\-]+/).some(w =>
        w.toLowerCase().startsWith(kwLower) || kwLower.startsWith(w.toLowerCase())
      )) score = Math.max(score, 55)
    }

    // N-gram fallback
    if (score === 0 && kw.length >= 2) {
      const kwGrams = new Set<string>()
      for (let i = 0; i < kw.length - 1; i++) kwGrams.add(kw.substring(i, i + 2))

      // Check equipment name
      const eqGrams = new Set<string>()
      for (let i = 0; i < equipNorm.length - 1; i++) eqGrams.add(equipNorm.substring(i, i + 2))
      let overlap = 0
      for (const g of kwGrams) if (eqGrams.has(g)) overlap++
      const similarity = overlap / Math.max(kwGrams.size, eqGrams.size)
      if (similarity > 0.3) score = Math.round(35 * similarity)

      // Check aliases
      for (const alias of eqAliases) {
        const aGrams = new Set<string>()
        const aN = normalizeStr(alias)
        for (let i = 0; i < aN.length - 1; i++) aGrams.add(aN.substring(i, i + 2))
        let ao = 0
        for (const g of kwGrams) if (aGrams.has(g)) ao++
        const as2 = ao / Math.max(kwGrams.size, aGrams.size)
        if (as2 > 0.3) score = Math.max(score, Math.round(35 * as2))
      }
    }

    if (score > 0) results.push({ name: equip, score })
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, 10)
}

// ============ LOAD RAW CASES PER EQUIPMENT ============
function loadEquipmentCases(equipName: string): any[][] {
  const hash = equipMap[equipName]
  if (!hash) return []
  try {
    const filePath = path.join(ROOT, 'public', 'static', 'data', `${hash}.json`)
    if (!fs.existsSync(filePath)) return []
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as any[][]
  } catch {
    return []
  }
}

// ============ PUBLIC API ============
export const dataService = {
  getStats() {
    return { groups: aggData.length, equipment: equipmentList.length, records: '70,656' }
  },

  getEquipmentList() {
    return equipmentList
  },

  analyze(keyword: string) {
    const matched = matchEquipment(keyword)
    if (matched.length === 0) {
      return { keyword, matched_equipment: [], top10: [], message: `"${keyword}"와(과) 일치하는 대상설비를 찾을 수 없습니다.` }
    }

    const threshold = 30
    let selected = matched.filter(m => m.score >= threshold)
    if (selected.length === 0) selected = matched.slice(0, 3)
    const equipNames = new Set(selected.map(m => m.name))

    const allFiltered = aggData.filter(g => equipNames.has(g.e))

    // 적응형 사례수 필터: 신뢰도 높은 결과 우선
    // ≥5건 → ≥3건 → 전체 순으로 완화
    let minCases = 5
    let filtered = allFiltered.filter(g => g.n >= minCases)
    if (filtered.length < 10) {
      minCases = 3
      filtered = allFiltered.filter(g => g.n >= minCases)
    }
    if (filtered.length < 10) {
      minCases = 0
      filtered = allFiltered
    }

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

    return {
      keyword,
      matched_equipment: selected,
      total_filtered_groups: allFiltered.length,
      min_cases_filter: minCases,
      filtered_groups: filtered.length,
      top10
    }
  },

  drilldown(equip: string, improve: string, action: string, limit: number = 40) {
    const allCases = loadEquipmentCases(equip)
    const cases = allCases
      .filter(r => r[IDX.개선구분] === improve && r[IDX.행위_표준] === action)
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

    return { group: { 대상설비: equip, 개선구분: improve, 행위_표준: action }, total: cases.length, cases }
  }
}
