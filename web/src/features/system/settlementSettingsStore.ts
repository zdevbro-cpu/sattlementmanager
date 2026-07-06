// 정산 설정 — 수수료율 등, 시스템관리에서 관리, localStorage 영속화
// (추후 정산센터/백엔드 연동 시 교체 가능)
import { useSyncExternalStore } from 'react'

export interface SettlementSettings {
  feeRate: number // 수수료율(%), 매출 대비 정산 시 차감
}

const DEFAULTS: SettlementSettings = { feeRate: 0 }

const KEY = 'sm.settlementSettings.v1'

function load(): SettlementSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<SettlementSettings>
    return { feeRate: Number(parsed.feeRate) || 0 }
  } catch {
    return DEFAULTS
  }
}

let state: SettlementSettings = load()
const listeners = new Set<() => void>()

function emit() {
  localStorage.setItem(KEY, JSON.stringify(state))
  listeners.forEach((l) => l())
}

export function getSettlementSettings(): SettlementSettings {
  return state
}

/** 수수료율(%) 수정 */
export function updateFeeRate(feeRate: number): void {
  state = { ...state, feeRate }
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** React 훅: 정산 설정 구독 */
export function useSettlementSettings(): SettlementSettings {
  return useSyncExternalStore(subscribe, getSettlementSettings, getSettlementSettings)
}
