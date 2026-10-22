import { CONTRACT_REGIONS, DEPOSIT_ACCOUNTS, RESIDENCY_OPTIONS, TAX_ID_TYPES, US_REGION } from '../../types/contract'
import type { UsFields } from './usLasOn'
import RateInput from './RateInput'

/**
 * 지역 선택 + 미국라스온 전용 입력(입금계좌·세무·BOA 계좌·신고용 인적사항).
 * 신규 계약 등록과 오타수정 폼이 같은 항목을 쓰도록 공용 컴포넌트로 둔다.
 * 지역이 국내이면 지역 선택만 보인다.
 */
export default function UsLasOnFields({
  value,
  onChange,
  inputCls,
  disabled,
  rateBaseDate,
}: {
  value: UsFields
  onChange: (v: UsFields) => void
  inputCls: string
  disabled?: boolean
  /** 적용 환율 기준일 — 신규는 계약일, 그 밖의 이력은 변경일 */
  rateBaseDate: string
}) {
  const set = <K extends keyof UsFields>(k: K, v: UsFields[K]) => onChange({ ...value, [k]: v })
  const isUs = value.region === US_REGION

  const text = (k: keyof UsFields, label: string, placeholder?: string) => (
    <Field label={label}>
      <input
        value={String(value[k] ?? '')}
        onChange={(e) => set(k, e.target.value as never)}
        className={inputCls}
        placeholder={placeholder}
        disabled={disabled}
      />
    </Field>
  )

  return (
    <div className="grid grid-cols-5 gap-3">
      <Field label="지역">
        <select
          value={value.region}
          onChange={(e) => set('region', e.target.value as UsFields['region'])}
          className={inputCls}
          disabled={disabled}
        >
          {CONTRACT_REGIONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Field>
      {isUs && (
        <>
          <Field label="입금계좌">
            <select
              value={value.depositAccount}
              onChange={(e) => set('depositAccount', e.target.value as UsFields['depositAccount'])}
              className={inputCls}
              disabled={disabled}
            >
              <option value="">선택</option>
              {DEPOSIT_ACCOUNTS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </Field>
          <Field label="거주자 여부">
            <select
              value={value.residency}
              onChange={(e) => set('residency', e.target.value)}
              className={inputCls}
              disabled={disabled}
            >
              <option value="">미확인</option>
              {RESIDENCY_OPTIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="원천세율(%)">
            <input
              inputMode="decimal"
              value={String(value.withholdingRate)}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d.]/g, '')
                set('withholdingRate', raw === '' ? 0 : Number(raw))
              }}
              className={`${inputCls} text-right tabular`}
              disabled={disabled}
            />
          </Field>
          <Field label="적용환율 (원/달러)">
            <RateInput
              baseDate={rateBaseDate}
              value={{ rate: value.exchangeRate, date: value.exchangeRateDate, source: value.exchangeRateSource }}
              onChange={(r) =>
                onChange({ ...value, exchangeRate: r.rate, exchangeRateDate: r.date, exchangeRateSource: r.source })
              }
              inputCls={inputCls}
              disabled={disabled}
            />
          </Field>

          <SubTitle>BOA 계좌</SubTitle>
          {text('boaBankName', '은행명', 'Bank of America')}
          {text('boaAccountNo', '계좌번호')}
          {text('boaRoutingNo', 'Routing Number(ABA)')}
          {text('boaSwiftCode', 'SWIFT 코드')}
          {text('boaAccountOwner', '영문 예금주명')}
          <div className="col-span-5">{text('boaAddress', '예금주 주소')}</div>

          <SubTitle>신고용 인적사항</SubTitle>
          <Field label="식별구분">
            <select
              value={value.taxIdType}
              onChange={(e) => set('taxIdType', e.target.value)}
              className={inputCls}
              disabled={disabled}
            >
              <option value="">선택</option>
              {TAX_ID_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          {text('taxIdNo', '식별번호')}
          {text('taxNameEn', '영문 성명')}
          {text('taxNationality', '국적')}
          <div />
          <div className="col-span-5">{text('taxAddress', '주소')}</div>
        </>
      )}
    </div>
  )
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <div className="col-span-5 mt-1 text-[12px] font-bold text-[#94a3b8]">{children}</div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-[#94a3b8]">{label}</span>
      {children}
    </label>
  )
}
