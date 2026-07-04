import { useState } from 'react'
import DropZone from '../../components/ui/DropZone'
import { uploadAppointmentDoc } from '../../lib/api'
import type { AppointmentDoc } from '../../types/appointment'
import { useDocTypes } from './docTypeStore'

/**
 * 제출서류 등록 — 종류별로 파일(PDF/이미지)을 Google Drive에 업로드하고 링크를 보관한다.
 * 서류 종류는 시스템관리 메뉴에서 관리한다.
 */
export default function DocUploadList({
  refId,
  value,
  onChange,
  uploadedAt,
}: {
  refId: string // 폴더/파일명 식별용 (계약번호)
  value: AppointmentDoc[]
  onChange: (docs: AppointmentDoc[]) => void
  uploadedAt: string
}) {
  const types = useDocTypes()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const pick = async (docType: string, file: File) => {
    setBusy(docType)
    setErr('')
    try {
      const link = await uploadAppointmentDoc(refId, file, docType)
      const doc: AppointmentDoc = {
        id: docType,
        docType,
        fileName: file.name,
        driveFileId: link.driveFileId,
        driveViewUrl: link.driveViewUrl,
        uploadedAt,
      }
      onChange([...value.filter((d) => d.docType !== docType), doc])
    } catch (e) {
      setErr(`${docType} 업로드 실패: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const remove = (docType: string) =>
    onChange(value.filter((d) => d.docType !== docType))

  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
      {types.map((t) => {
        const doc = value.find((d) => d.docType === t)
        return (
          <div key={t} className="rounded-[8px] border border-border p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12.5px] font-bold text-[#c2cde0]">{t}</span>
              {doc && (
                <button
                  type="button"
                  onClick={() => remove(t)}
                  className="text-[11.5px] text-danger hover:brightness-110"
                >
                  삭제
                </button>
              )}
            </div>
            {doc ? (
              <a
                href={doc.driveViewUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-[6px] bg-input px-2.5 py-1.5 text-[12px] hover:bg-hover"
              >
                <span className="text-[#c2cde0]">📎 {doc.fileName}</span>
                <span className="text-primary font-bold">Drive 열기 →</span>
              </a>
            ) : (
              <DropZone
                onFile={(f) => pick(t, f)}
                compact
                accept=".pdf,image/*"
                hint={
                  busy === t
                    ? '업로드 중…'
                    : 'PDF/이미지 — 클릭(탐색기) 또는 드래그드롭'
                }
              />
            )}
          </div>
        )
      })}
      </div>
      {err && <div className="mt-2 text-[11.5px] text-danger">{err}</div>}
    </div>
  )
}
