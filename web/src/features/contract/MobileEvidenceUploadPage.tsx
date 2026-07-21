import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, CheckCircle2, ChevronLeft } from 'lucide-react'
import { comma } from '../../lib/format'
import { uploadToDrive } from '../../lib/api'
import DropZone from '../../components/ui/DropZone'
import { useAuth } from '../auth/AuthContext'
import { EMPTY_FILTER, type Contract } from '../../types/contract'
import { listContracts } from './contractStore'

const inputCls =
  'h-11 w-full rounded-[8px] bg-input border border-border px-3 text-[14px] text-input-text outline-none focus:border-primary'

/**
 * 모바일 증빙 등록 — 이미 등록된(증빙 없는) 계약을 검색해서 선택한 뒤,
 * 카메라로 촬영한 계약서/전표/입금증을 그 계약에 바로 첨부한다.
 * 동명이인 구분을 위해 후보 목록에 주민번호 앞자리(생년월일)와 보증금을 함께 보여준다.
 */
export default function MobileEvidenceUploadPage() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Contract | null>(null)
  const [uploading, setUploading] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    listContracts(EMPTY_FILTER).then((list) => {
      setContracts(list)
      setLoading(false)
    })
  }, [])

  // 증빙(첨부문서)이 없는 계약만 후보로 노출
  const candidates = query.trim()
    ? contracts.filter(
        (c) => c.current.documents.length === 0 && c.current.contractorName.includes(query.trim()),
      )
    : []

  const selectContract = (c: Contract) => {
    setSelected(c)
    setQuery('')
    setDoneMsg('')
    setErr('')
  }

  const cancelSelect = () => {
    setSelected(null)
    setDoneMsg('')
    setErr('')
  }

  const onFile = async (file: File) => {
    if (!selected) return
    setUploading(true)
    setErr('')
    setDoneMsg('')
    try {
      await uploadToDrive(selected.id, file, '증빙 등록(모바일)', selected.current.historyId)
      setDoneMsg(`${selected.current.contractorName} 계약에 증빙 등록 완료`)
      setSelected(null)
      // 목록 갱신 — 방금 등록한 건은 더 이상 "증빙 없음" 후보에 안 나오도록
      listContracts(EMPTY_FILTER).then(setContracts)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] px-4 py-5">
      <div className="mb-3">
        <button onClick={() => navigate('/')} className="inline-flex items-center gap-0.5 text-[12px] text-[#94a3b8] hover:text-white">
          <ChevronLeft size={14} /> 처음으로
        </button>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-1.5 text-[18px] font-extrabold text-text-strong"><Camera size={18} /> 증빙 등록</h1>
        <div className="flex items-center gap-2">
          <span className="max-w-[140px] truncate text-[11px] text-[#64748b]">{user?.email}</span>
          <button onClick={() => signOut()} className="text-[11px] font-semibold text-[#94a3b8] hover:text-white">
            로그아웃
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <section className="rounded-[14px] border border-border bg-card p-4">
          <p className="mb-3 text-[12.5px] text-[#94a3b8]">
            증빙(계약서/전표/입금증)이 아직 없는 계약을 계약자명으로 검색해서 선택한 뒤, 촬영한 사진을 첨부하세요.
          </p>
          {!selected && (
            <>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="계약자명 검색"
                className={inputCls}
              />
              {query.trim() && (
                <div className="mt-2 rounded-[8px] border border-border divide-y divide-border max-h-64 overflow-y-auto">
                  {candidates.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => selectContract(c)}
                      className="w-full text-left px-3 py-2.5 text-[13px] hover:bg-hover"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-text-strong">{c.current.contractorName}</span>
                        <span className="text-[#94a3b8]">{comma(c.current.deposit)}원</span>
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-[#94a3b8]">
                        주민번호 앞자리 : {(c.current.residentNo || '').slice(0, 6) || '-'} · {c.current.contractType} · {c.current.contractDate}
                      </div>
                    </button>
                  ))}
                  {!loading && candidates.length === 0 && (
                    <div className="px-3 py-6 text-center text-[12.5px] text-[#94a3b8]">검색된 계약이 없습니다.</div>
                  )}
                </div>
              )}
            </>
          )}

          {selected && (
            <div className="space-y-3">
              <div className="rounded-[8px] border border-primary/40 bg-primary/5 p-3 text-[13px]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-text-strong">{selected.current.contractorName}</span>
                  <button onClick={cancelSelect} className="text-[11.5px] text-danger hover:underline">
                    선택 취소
                  </button>
                </div>
                <div className="mt-1 text-[11.5px] text-[#94a3b8]">
                  주민번호 앞자리 : {(selected.current.residentNo || '').slice(0, 6) || '-'} · 보증금 {comma(selected.current.deposit)}원 · {selected.current.contractType}
                </div>
              </div>
              <DropZone onFile={onFile} accept="image/*" capture="environment" hint="증빙 촬영">
                <div className="text-[12.5px] text-[#94a3b8]">
                  <span className="text-primary font-bold">탭해서 촬영</span> 또는 갤러리에서 선택
                </div>
              </DropZone>
              {uploading && <div className="text-[12.5px] text-[#94a3b8]">업로드 중…</div>}
            </div>
          )}
        </section>

        {err && <div className="text-[13px] text-danger">{err}</div>}
        {doneMsg && (
          <div className="flex items-center gap-1 text-[13px] font-bold text-success">
            <CheckCircle2 size={14} /> {doneMsg}
          </div>
        )}
      </div>
    </div>
  )
}
