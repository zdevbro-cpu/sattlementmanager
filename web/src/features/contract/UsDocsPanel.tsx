import { useState } from 'react'
import { CheckCircle2, ExternalLink, Paperclip, XCircle } from 'lucide-react'
import type { Contract, DocumentKind } from '../../types/contract'
import { US_RECEIPT_PROOF, US_REQUIRED_DOC_KINDS } from '../../types/contract'
import { uploadToDrive } from '../../lib/api'
import { allDocuments, usDocStatus } from './usLasOn'

/**
 * 계약상세 — 미국라스온 필요서류.
 * 계약서·통장사본·신분증사본은 서류별로 따로 올리고, 입금증빙은 입금장부의 증빙으로 판정한다.
 * 유무는 체크박스가 아니라 실제 파일 존재로 자동 표시한다. 모두 갖춰지면 상세화면이
 * 임시저장 계약을 신규 정상등록으로 자동 전환한다(ContractDetailDrawer).
 */
export default function UsDocsPanel({
  contract,
  onChanged,
}: {
  contract: Contract
  onChanged: () => void
}) {
  const status = usDocStatus(contract)
  const docs = allDocuments(contract)
  const [busy, setBusy] = useState<DocumentKind | null>(null)
  const [err, setErr] = useState('')

  const upload = async (kind: DocumentKind, file: File) => {
    setBusy(kind)
    setErr('')
    try {
      await uploadToDrive(contract.id, file, kind, contract.current.historyId, kind)
      onChanged()
    } catch (e) {
      setErr(`${kind} 업로드 실패 — ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section>
      <h3 className="mb-2.5 text-[13px] font-extrabold text-text-strong">
        필요서류 (미국라스온){' '}
        <span className={`font-semibold ${status.complete ? 'text-success' : 'text-warning'}`}>
          · {status.complete ? '모두 등록됨' : `누락: ${status.missing.join(', ')}`}
        </span>
      </h3>
      <div className="rounded-[10px] border border-border divide-y divide-border">
        {status.items.map((it) => {
          const kind = it.label as DocumentKind
          const isReceipt = it.label === US_RECEIPT_PROOF
          const files = isReceipt ? [] : docs.filter((d) => d.kind === kind)
          return (
            <div key={it.label} className="flex items-center justify-between gap-3 px-3 py-2 text-[12.5px]">
              <div className="flex items-center gap-2 min-w-0">
                {it.ok ? (
                  <CheckCircle2 size={15} className="shrink-0 text-success" />
                ) : (
                  <XCircle size={15} className="shrink-0 text-danger" />
                )}
                <span className="font-bold text-text-strong whitespace-nowrap">{it.label}</span>
                <span className="flex flex-wrap gap-x-3 min-w-0">
                  {isReceipt ? (
                    <span className="text-[#94a3b8]">아래 입금장부에서 입금 추가 시 증빙 첨부</span>
                  ) : (
                    files.map((d) => (
                      <a
                        key={d.id}
                        href={d.driveViewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary font-semibold truncate"
                      >
                        {d.fileName} <ExternalLink size={11} />
                      </a>
                    ))
                  )}
                </span>
              </div>
              {!isReceipt && US_REQUIRED_DOC_KINDS.includes(kind) && (
                <label className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-[8px] border border-border px-2.5 font-semibold text-[#c2cde0] hover:bg-hover">
                  <Paperclip size={12} /> {busy === kind ? '업로드 중…' : it.ok ? '추가 등록' : '등록'}
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    disabled={busy !== null}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      if (f) upload(kind, f)
                    }}
                  />
                </label>
              )}
            </div>
          )
        })}
      </div>
      {err && <div className="mt-2 text-[12px] text-danger">{err}</div>}
    </section>
  )
}
