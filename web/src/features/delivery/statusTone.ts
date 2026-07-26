import type { Tone } from '../../components/ui/Badge'

/** 배송 상태 → 배지 색. 진행할수록 파랑→초록, 보류/취소는 회색·주황 계열로 구분한다. */
export function shipmentStatusTone(status: string): Tone {
  switch (status) {
    case '접수':
      return 'slate'
    case '추후배송':
      return 'amber' // 배송지 미확정 — 눈에 띄어야 보정된다
    case '목록확정':
      return 'sky'
    case '전송완료':
      return 'blue'
    case '배송중':
      return 'purple'
    case '배송완료':
      return 'teal'
    case '완료확인':
      return 'green'
    case '취소':
      return 'red'
    default:
      return 'slate'
  }
}
