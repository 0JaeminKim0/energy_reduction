# 설비 키워드 기반 정량 분석 PoC

## Project Overview
- **Name**: Equipment Insight PoC
- **Goal**: 키워드 입력만으로 에너지 절감 사례 70,000+건 기반 정량 Top10 분석 + 전략적 Insight + Drill-down 제공
- **Platform**: Railway 배포 (Node.js + Hono)
- **Data**: DB_2024_표준화_v4.xlsx (원본_표준화 시트, 70,656건)

## Features
- **키워드 → 대상설비 유사도 매칭**: 한글/영문 키워드로 67개 설비 유형 중 매칭
- **절감액(평균) Top 10 테이블**: 대상설비 + 개선구분 + 행위_표준 기준 그룹 집계
- **Drill-down(B) 드로어**: 사례수 클릭 시 실제 사례 40개 원문 + 한 줄 요약
- **전략적 Insight 카드**: Claude AI 기반 (API 키 없으면 로컬 폴백)
- **UI Effect**: 순차적 "딱딱" 등장 애니메이션

## Tech Stack
- **Backend**: Hono (Node.js) + @hono/node-server
- **Frontend**: TailwindCSS CDN + Vanilla JS (단일 페이지)
- **LLM**: Anthropic Claude API (선택적)
- **Deployment**: Railway (Docker)

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | 메인 페이지 |
| GET | `/api/health` | 서버 상태 확인 |
| GET | `/api/equipment` | 전체 설비 목록 |
| POST | `/api/analyze` | 키워드 분석 → Top10 |
| POST | `/api/drilldown` | 그룹별 사례 상세 조회 |
| POST | `/api/insight` | Claude 인사이트 생성 |
| POST | `/api/summarize` | Claude 한줄 요약 생성 |

## Environment Variables (Railway Variables)
| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | Auto | Railway가 자동 설정 |
| `ANTHROPIC_API_KEY` | Optional | Claude API 키 (없으면 로컬 폴백) |

## Deployment (Railway)
1. GitHub에 push
2. Railway에서 해당 repo 연결
3. Variables에 `ANTHROPIC_API_KEY` 설정 (선택)
4. 자동 빌드/배포

## Data Architecture
- `src/data_aggregated.json`: 13,843개 그룹 집계 데이터 (절감액 평균, 사례수 등)
- `src/equipment_aliases.json`: 67개 설비별 한글/영문 별칭 매핑
- `public/static/data/*.json`: 설비별 개별 사례 데이터 (Drill-down용)
- `data/DB_2024_표준화_v4.xlsx`: 원본 엑셀 (9.3MB)

## Local Development
```bash
npm install
npm run dev      # tsx watch mode
npm run build    # TypeScript 컴파일
npm start        # 프로덕션 실행
```
