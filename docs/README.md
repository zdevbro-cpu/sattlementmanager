# Handoff: Settlement Manager (정산관리 웹앱)

## Overview
Settlement Manager는 계약 → 매출 → 정산 → 수당/급여 → 지급 → 회계 → 통계로 이어지는
운영 흐름을 하나의 관리자(admin) 웹앱에서 처리하는 내부 시스템입니다. 이 핸드오프는
데스크톱 관리자 대시보드의 핵심 화면들을 담고 있습니다.

원본 기획 2종을 기반으로 합니다.
- `sattlementmanager_개발계획.docx` — 시스템 목표, 업무 프로세스, 8개 메뉴 구조, 계약/매출/정산/지급 요구사항, 데이터 구조, 개발 스택
- `sitemap.drawio` — 8개 대분류와 하위 메뉴 사이트맵

## About the Design Files
번들에 포함된 `Settlement Manager.dc.html`는 **HTML로 제작된 디자인 레퍼런스**입니다.
의도한 레이아웃·색상·인터랙션을 보여주는 프로토타입이며, **그대로 복사해 배포하는 프로덕션
코드가 아닙니다.** 목표는 이 HTML 디자인을 대상 코드베이스의 실제 환경에서 재현하는 것입니다.

기획서(`8. 개발 요구사항`)가 명시한 권장 스택:
- **Front:** Vite + React + TypeScript + Tailwind CSS + TanStack Query + React Hook Form
- **Backend:** Firebase Authentication, Cloud Functions, PostgreSQL, Prisma ORM, Storage

위 스택으로 신규 구현하는 것을 전제로, 이 문서의 토큰/레이아웃 값을 Tailwind 테마와
컴포넌트로 옮기면 됩니다. 기존 코드베이스가 이미 있다면 그 디자인 시스템/패턴을 우선합니다.

## Fidelity
**High-fidelity (hifi).** 최종 색상·타이포·간격·상태가 확정된 픽셀 목업입니다.
아래 디자인 토큰과 컴포넌트 스펙을 그대로 재현하세요. 단, 표에 채워진 데이터는
샘플이며 실제로는 API 연동 대상입니다.

## Global Shell (모든 화면 공통)

### Layout
- 최상위: `display:flex`, 최소 높이 `100vh`, 전체 폭
- **좌측 사이드바** 폭 `236px` 고정, `position:sticky; top:0; height:100vh`
- **우측 메인** `flex:1`, 세로 컬럼: 상단바(고정) + 스크롤 영역
- 상단바 높이 `60px`, `position:sticky; top:0; z-index:20`
- 메인 콘텐츠 패딩 `26px 28px 48px`

### Sidebar
- 배경 `#0d1322`, 텍스트 `#9fb3d1`
- 로고: 34×34, radius 9, 그라디언트 `linear-gradient(135deg,#14b8a6,#0ea5b7)`, 흰색 레이어 아이콘.
  타이틀 "Settlement"(800/15px/#fff) + "MANAGER"(600/10.5px/#5f7ba6, letter-spacing 1.5px)
- 섹션 라벨: 10.5px/700/#3f5983, letter-spacing 1px ("운영", "정산 & 회계", "인사이트")
- 네비 항목: `padding 9px 12px`, radius 9, 13.5px/700, gap 10, `border-left:3px solid transparent`
  - 기본 색 `#9fb3d1`
  - hover: 배경 `#132a4d`, 색 `#e2e8f0`
  - **active**: 색 `#ffffff`, 배경 `#16305a`, `border-left:3px solid #38bdf8`
- 하단 사용자 블록: 상단 `border-top:1px solid #16305a`. 아바타 32원형 배경 `#1d3a63`/텍스트 `#8fb0e0`.
  "admin@las.com"(12.5px/700/#e2e8f0) + "시스템관리자"(10.5px/#5f7ba6)

### 사이드바 메뉴 (사이트맵 8개 대분류)
운영 그룹: 대시보드 / 기준정보 / 계약관리 / 매출관리
정산 & 회계 그룹: 정산센터 / 지급관리 / 회계관리
인사이트 그룹: 통계 / 시스템관리
클릭 시 해당 화면으로 라우팅. (프로토타입은 단일 상태 `menu`로 화면 전환)

### Topbar
- 배경 `#0d1322`, 하단 `border-bottom:1px solid #1c2438`, 좌우 패딩 28
- 좌측: breadcrumb `{대분류}`(12px/#94a3b8) + "/"(#cbd5e1) + 현재 화면명(16px/800/#e2e8f0)
- 우측: 검색 인풋(폭 230, 높이 36, radius 9, 배경 `#10182b`, 보더 `#232c45`, placeholder "계약자·매출 검색"),
  알림 벨 버튼(36×36, 빨간 점 배지 `#ef4444` + `#0d1322` 링), 세로 구분선 `#232c45`, 날짜 "2026-07-04 (금)"

## Screens / Views

### 1. 대시보드 (Dashboard) — breadcrumb "운영"
- **KPI 카드 4개** (`grid repeat(4,1fr)`, gap 16). 각 카드: 배경 `#141b2e`, 보더 `#232c45`, radius 14, 패딩 18/20.
  아이콘칩 38×38 radius 11(연한 tint 배경 + 진한 아이콘색), 라벨 13px/600/#64748b, 값 25px/800/#eaf1fb, 델타(증감) 12px/600 (증가 `#16a34a`, 감소 `#ef4444`).
  - 진행중 계약 860건 / 아이콘 tint `#e0edff`·색 `#2563eb`
  - 당월 매출 12.8억 / tint `#e2f7ec`·색 `#16a34a`
  - 당월 수당 2.62억 / tint `#fff1e0`·색 `#f59e0b`
  - 당월 급여 3,624만 / tint `#f0eafd`·색 `#8b5cf6`
- **하단 2컬럼** `grid 1.55fr 1fr`:
  - **최근 계약 현황** 카드 + 테이블(계약일/계약자/유형/계약금액/상태). 헤더 우측 "전체보기 →"(#2563eb) → 계약조회로 이동.
  - **이번 달 정산 파이프라인**: 5단계(매출 집계→수수료 차감→정산금액→수당 산출→급여 생성) 각 단계 번호칩 + 라벨 + 값 + 진행 바(track `#1e2740`, fill 단계색·너비 %). 하단 "정산 계산 실행 →" 버튼(배경 `#4f46e5`).
- **추천인 순위**: 상위 8명 카드 그리드 `repeat(4,1fr)`. 순위칩 + 이름 + 소속 + n명.

### 2. 계약 조회 (Contract) — breadcrumb "계약관리"
- 헤더: 타이틀 "계약 조회" + 설명 + 우측 "＋ 계약 등록" 버튼(배경 `#2563eb`)
- 요약 카드 4개(전체 860 / 이번달 신규 44 / 검토 대기 7 / 해약·폐기 12)
- **필터 바**(배경 `#141b2e`, `grid repeat(5,1fr) auto`): 기간 시작·종료(date), 계약유형(select: 전체/신규/증액/양도/양수/해약/폐기), 계약대상(전체/직원/LAS 점주/LAS-On 파트장/LAS-On 파트너), 계약자명, [검색 `#4f46e5`][초기화]
- **테이블**: 번호/계약일/계약자/대상구분/유형/추천인/계약금액(우측정렬)/계좌검증/상태/관리(👁). 헤더 우측 "⭳ 엑셀 다운로드"(#16a34a). 하단 페이지네이션(현재 페이지 `#2563eb`).
- 유형 배지 컬러: 신규=green, 증액=sky(`#0284c7`), 양도=amber(`#b45309`), 양수=blue, 해약=red(`#dc2626`), 폐기=slate

### 3. 카드매출 등록 관리 (Sales) — breadcrumb "매출관리"
- 헤더: 타이틀 + [엑셀 다운로드][＋ 카드매출 등록]
- 요약 카드 4개(당월 카드매출/현금매출/분할결제 진행/전표 미검증)
- **매출 분류 칩** 영역: 7종 pill (LAS On 파트장/파트너, 매장결제, 구독회원 S2, 현금(소득공제), 독서지도사, 점주보증금) + "(max N)"
- **필터 바**: 기간, 매출구분(select), 사업부, 구매자, [검색][초기화]
- **테이블**(가로 스크롤, min-width 1020): 번호/날짜/사업부/구매자/내용(배지)/금액(우측·800)/카드사/카드번호/승인번호/담당/관리.
  - 분할 매출 행은 번호 옆 `📷{회차}` 앰버 배지(카드분할매출·현금분할입금: 전표/입금증 최대 6개 촬영 개념)

### 4. 정산 계산 (Settlement) — breadcrumb "정산센터"
- 헤더 우측 "▶ 2026-07 정산 실행"(배경 `#4f46e5`)
- **5단계 흐름 카드**(`grid repeat(5,1fr)`): STEP 1 매출 집계 → 2 수수료 차감(-) → 3 정산금액 → 4 수당 산출 → 5 급여 생성. 각 카드 STEP 라벨(단계색) + 라벨 + 값(19px/800) + note.
- **2컬럼** `grid 1.5fr 1fr`:
  - **대상자별 정산 내역** 테이블: 대상자/구분(역할 배지)/매출/수수료(빨강 -)/정산금액/수당(파랑 800). 헤더에 "마감 전 · 검토중" 앰버 배지.
  - **적용 정산 규칙**: 카드 리스트(규칙명 + "● 활성" + 조건 텍스트) — 기획서상 "프로그램매니저 조건엔진" 연동. 하단 "＋ 정산기준 관리".

### 5. 전표 관리 (Accounting) — breadcrumb "회계관리"
- 요약 카드 4개(당월 입금 `#16a34a` / 당월 출금 `#ef4444` / 전표 건수 / 미처리 전표 `#f59e0b`)
- **테이블**: 전표번호/일자/구분(입금 green·출금 red 배지)/계정/적요/은행/금액(우측, 색은 구분색)

### 6. 매출 통계 (Stats) — breadcrumb "통계"
- **2컬럼** `grid 1.6fr 1fr`:
  - **월별 매출 추이**: 막대 차트(7개월). 각 월 2개 막대 — 매출(그라디언트 `#3b82f6→#2563eb`) + 수당(`#bfdbfe`). 범례 포함. 높이 230px, 값은 % 높이.
  - **매출 구성**: 5개 항목 진행 바(카드매출/현금매출/구독료/점주보증금/기타), 각 라벨 + 값 + % + 컬러 바.
- **사업부별 실적** 테이블: 사업부/계약건수/매출/수당/급여/달성률(색: ≥100 green, ~90 blue, 그 이하 amber/red)

### 7. 기준정보·지급관리·시스템관리 (Generic list) 
공통 리스트 템플릿(헤더 + 추가 버튼 + 테이블):
- 기준정보 → **직원 관리** (사번/성명/부서/직급/연락처/상태)
- 지급관리 → **지급 내역** (지급일/수령인/지급종류/금액/상태[예정·승인·지급완료·보류·취소]/비고)
- 시스템관리 → **사용자 관리** (계정/성명/권한[관리자·대표·PM·재무·인사·점주·파트장·파트너·조회전용]/최근 접속/상태)

## Interactions & Behavior
- **네비게이션**: 사이드바 항목 클릭 → 현재 화면 상태 변경, 상단 breadcrumb·타이틀 동기화. 대시보드의 "전체보기 →", "정산 계산 실행 →"도 각 화면으로 라우팅.
- **hover**: 네비 항목 배경 밝아짐, 테이블 행 배경 `#1a2440`, 아이콘 버튼 배경 `#1a2440`.
- **input focus**: 보더 `#2563eb`, `box-shadow 0 0 0 3px rgba(37,99,235,.12)`.
- 실제 앱에서 필요한 동작(프로토타입에 미구현): 검색/필터 → TanStack Query 목록 요청, 페이지네이션, 엑셀 다운로드, 계약 등록/변경/종료/복원 폼(React Hook Form), 전표 카메라 촬영·이미지 첨부(최대 6개, Storage 업로드), 정산 실행 배치(Cloud Functions), 지급 승인 워크플로.

## State Management
- 현재 프로토타입: 단일 상태 `menu`('dashboard'|'base'|'contract'|'sales'|'settlement'|'payment'|'accounting'|'stats'|'system')로 화면 전환.
- 실제 앱 권장 상태:
  - 라우팅: React Router (URL = 메뉴 경로)
  - 서버 상태: TanStack Query (계약/매출/정산/전표/지급 목록 + 상세, 필터·페이지 파라미터 키)
  - 폼 상태: React Hook Form (계약/매출 등록·수정)
  - 세션/권한: Firebase Auth 사용자 + 역할(권한별 메뉴/버튼 노출 제어)
- 데이터 엔티티(기획서 `9. 데이터 구조`): Member, Organization, Contract, ContractHistory, Sales, SalesItem, Deposit, Settlement, SettlementRule, Commission, Payroll, Payment, PaymentHistory, Product, Subscription, BookSales, Store, Partner, Manager

## Design Tokens

### Colors — Surfaces (dark)
- 페이지 배경: `#0a0e1a`
- 사이드바 / 상단바: `#0d1322`
- 카드·패널: `#141b2e`
- 보더(기본): `#232c45`  · 상단바 보더: `#1c2438`
- 테이블 헤더 / 인풋 배경: `#10182b`
- 행 구분선 / 진행 track: `#1e2740`
- 행·아이콘 hover: `#1a2440`
- 사이드바 active 배경 `#16305a`, hover `#132a4d`, 보더 `#16305a`, active accent `#38bdf8`

### Colors — Text
- 본문 기본: `#e2e8f0`  · 강한 숫자/제목: `#eaf1fb`
- 중간 톤: `#c2cde0`  · 보조: `#94a3b8`  · 흐린: `#64748b`
- 인풋 텍스트: `#cbd5e1`

### Colors — Accents / States
- Primary(CTA blue): `#2563eb`  · Primary(indigo, 실행/검색): `#4f46e5`
- Success/입금: text `#16a34a`  · Danger/출금: `#ef4444` / `#dc2626`
- Warning: `#f59e0b` / `#b45309`  · Purple: `#8b5cf6`  · Sky: `#0284c7` / `#38bdf8`  · Teal(logo): `#14b8a6`
- 배지 tint(연한 배경) 예: blue `#e0edff`, green `#e2f7ec`, amber `#fff1e0`, purple `#f0eafd`, red `#fee2e2`, sky `#e0f2fe`, yellow `#fef3c7`, slate `#f1f5f9`
  (다크 카드 위 밝은 컬러 pill로 사용)

### Typography
- Font family: **Pretendard** (`'Pretendard','Pretendard Variable',-apple-system,sans-serif`)
- 화면 타이틀 h1: 22px / 800 / letter-spacing -0.5px
- 카드 섹션 타이틀: 15px / 800
- KPI 값: 25px / 800 (letter-spacing -0.6px)
- 테이블 헤더: 12.5~13px / 600 / `#94a3b8`
- 테이블 셀: 13px (매출 테이블 12.5px)
- 배지: 11~11.5px / 700
- 숫자 컬럼: `font-variant-numeric: tabular-nums`

### Spacing / Radius / Shadow
- 카드 radius: 14 (작은 요약카드 12), 버튼/인풋 radius: 8~10, 배지 radius: 6~20(pill)
- 카드 패딩: 18/20 (요약 14/16), 그리드 gap: 12~16
- 인풋/버튼 높이: 필터 38, 헤더 CTA 40, 상단바 36
- 그림자: 거의 없음(다크). KPI 카드 `0 1px 2px rgba(16,24,40,.04)`

## Assets
- **폰트**: Pretendard (CDN: `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css`). 실제 앱에서는 npm `pretendard` 패키지 또는 self-host 권장.
- **아이콘**: 인라인 SVG(로고 레이어, 검색, 알림 벨) + 유니코드 글리프(네비 ▦◱▤▧∑₩▥◔⚙, 관리 👁, 카메라 📷, 다운로드 ⭳). 실제 앱에서는 아이콘 라이브러리(lucide-react 등)로 교체 권장.
- **이미지 없음** — 전 화면 CSS/SVG로 구성. 별도 브랜드 에셋 없음.

## Screenshots
`screenshots/` 폴더에 다크 톤 최종 화면 캡처가 있습니다.
- `01-dashboard.png` — 대시보드
- `02-contract.png` — 계약 조회
- `03-sales.png` — 카드매출 등록 관리
- `04-settlement.png` — 정산 계산
- `05-accounting.png` — 전표 관리
- `06-stats.png` — 매출 통계

## Files
- `Settlement Manager.dc.html` — 전 화면(대시보드·계약·매출·정산·회계·통계·기준정보·지급·시스템)이 담긴 단일 디자인 프로토타입.
  Design Component 형식(`<x-dc>` 템플릿 + `class Component` 로직)으로, 상단 `<helmet>`에 폰트/리셋,
  이후 사이드바·상단바·화면별 `sc-if` 블록으로 구성. 색상·레이아웃 참조용으로 열어보면 됩니다.
