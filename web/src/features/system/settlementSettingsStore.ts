// 정산 설정 — 수수료율 등, 시스템관리에서 관리.
// Cloud SQL(app_settings) 저장, localStorage는 로딩 전 캐시로만 사용.
import { useSyncExternalStore } from 'react'
import { fetchSettlementFeeRate, updateSettlementFeeRateApi } from '../../lib/api'

export interface SettlementSettings {
  feeRate: number // 수수료율(%), 매출 대비 정산 시 차감
}

const DEFAULTS: SettlementSettings = { feeRate: 0 }

const KEY = 'sm.settlementSettings.v1'

function loadCache(): SettlementSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<SettlementSettings>
    return { feeRate: Number(parsed.feeRate) || 0 }
  } catch {
    return DEFAULTS
  }
}

let state: SettlementSettings = loadCache()
const listeners = new Set<() => void>()

function emit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

function save() {
  updateSettlementFeeRateApi(JSON.stringify(state)).catch(() => {
    /* 서버 저장 실패는 조용히 무시 — 다음 로드 시 재동기화 */
  })
}

fetchSettlementFeeRate()
  .then((raw) => {
    if (!raw) {
      // 서버에 아직 값이 없으면(최초 마이그레이션) 이 기기의 기존 캐시를 그대로 서버에 올려 보존한다
      save()
      return
    }
    const parsed = JSON.parse(raw) as Partial<SettlementSettings>
    state = { feeRate: Number(parsed.feeRate) || 0 }
    emit()
  })
  .catch(() => {
    /* 서버 미응답 시 로컬 캐시 유지 */
  })

export function getSettlementSettings(): SettlementSettings {
  return state
}

/** 수수료율(%) 수정 */
export function updateFeeRate(feeRate: number): void {
  state = { ...state, feeRate }
  emit()
  save()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** React 훅: 정산 설정 구독 */
export function useSettlementSettings(): SettlementSettings {
  return useSyncExternalStore(subscribe, getSettlementSettings, getSettlementSettings)
}
