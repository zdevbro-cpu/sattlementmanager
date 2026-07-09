// 조직관리(임용계약) 도메인 DB 레포지토리 (Cloud SQL / PostgreSQL)
const { pool } = require('./db')

/** DATE/TIMESTAMPTZ 값 → YYYY-MM-DD (KST 기준). UTC로 바로 slice하면 자정~오전9시 사이 값이 하루 전으로 표시된다. */
function isoDate(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

/** DB row → 프론트 Appointment 형태로 매핑 */
function mapAppointment(a, history, documents) {
  return {
    id: a.id,
    contractNo: a.contract_no || '',
    name: a.name,
    typeName: a.type_name || '',
    ref: a.ref || '',
    residentNo: a.resident_no || '',
    phone: a.phone || '',
    position: a.position || '',
    salary: Number(a.salary || 0),
    activity: Number(a.activity || 0),
    insuranceType: a.insurance_type || '사업소득',
    contractDate: isoDate(a.contract_date),
    payoutDate: isoDate(a.payout_date),
    workStartDate: isoDate(a.work_start_date),
    reportStartDate: isoDate(a.report_start_date),
    endDate: isoDate(a.end_date),
    bankName: a.bank_name || '',
    accountNo: a.account_no || '',
    accountOwner: a.account_owner || '',
    status: a.status,
    createdAt: isoDate(a.created_at),
    history: (history || []).map((h) => ({
      historyId: String(h.id),
      editedAt: isoDate(h.edited_at),
      memo: h.memo || '',
      changes: h.changes || [],
    })),
    documents: (documents || []).map((d) => ({
      id: String(d.id),
      docType: d.doc_type,
      fileName: d.file_name,
      driveFileId: d.drive_file_id || '',
      driveViewUrl: d.drive_view_url || '#',
      uploadedAt: isoDate(d.uploaded_at),
    })),
  }
}

/** 임용계약 목록 (필터 적용) */
async function listAppointments(filter = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM appointments ORDER BY created_at DESC`,
  )
  const { keyword, startDate, endDate } = filter
  return rows
    .map((a) => mapAppointment(a, [], []))
    .filter((a) => {
      if (keyword && !a.name.includes(keyword) && !a.ref.includes(keyword))
        return false
      if (startDate && a.contractDate && a.contractDate < startDate) return false
      if (endDate && a.contractDate && a.contractDate > endDate) return false
      return true
    })
}

/** 단일 임용계약 (이력·서류 포함) */
async function getAppointment(id) {
  const { rows: ar } = await pool.query(
    `SELECT * FROM appointments WHERE id = $1`,
    [id],
  )
  if (!ar.length) return null
  const { rows: hist } = await pool.query(
    `SELECT * FROM appointment_history WHERE appointment_id = $1 ORDER BY id DESC`,
    [id],
  )
  const { rows: docs } = await pool.query(
    `SELECT * FROM appointment_documents WHERE appointment_id = $1 ORDER BY id`,
    [id],
  )
  return mapAppointment(ar[0], hist, docs)
}

function nn(v) {
  return v === '' || v === undefined ? null : v
}

/** 신규 임용계약 등록 */
async function createAppointment(a) {
  const { rows: n } = await pool.query(`SELECT COUNT(*)::int AS c FROM appointments`)
  const id = `AP${String(n[0].c + 1).padStart(3, '0')}`
  await pool.query(
    `INSERT INTO appointments
       (id, contract_no, name, type_name, ref, resident_no, phone, position,
        salary, activity, insurance_type, contract_date, payout_date,
        work_start_date, report_start_date, end_date,
        bank_name, account_no, account_owner, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
    [
      id,
      a.contractNo || '',
      a.name,
      a.typeName || '',
      a.ref || '',
      a.residentNo || '',
      a.phone || '',
      a.position || '',
      a.salary || 0,
      a.activity || 0,
      a.insuranceType || '사업소득',
      nn(a.contractDate),
      nn(a.payoutDate),
      nn(a.workStartDate),
      nn(a.reportStartDate),
      nn(a.endDate),
      a.bankName || '',
      a.accountNo || '',
      a.accountOwner || '',
      a.status || '정상운영',
      nn(a.createdAt) || new Date(),
    ],
  )
  // 등록 화면에서 계약 저장 전에 미리 올려둔 제출서류(Drive 업로드는 끝났고 DB 기록만 없는 상태)를 연결
  for (const doc of a.documents || []) {
    if (!doc.driveFileId) continue
    await addAppointmentDocument(id, {
      docType: doc.docType,
      fileName: doc.fileName,
      driveFileId: doc.driveFileId,
      driveViewUrl: doc.driveViewUrl,
    })
  }
  return await getAppointment(id)
}

/** 임용계약 수정 — 변경된 항목을 비교해 이력 1건 남기고 갱신 */
async function updateAppointment(id, patch, meta) {
  const cur = await getAppointment(id)
  if (!cur) return null

  const FIELD_TO_COLUMN = {
    name: 'name',
    phone: 'phone',
    position: 'position',
    salary: 'salary',
    insuranceType: 'insurance_type',
    contractDate: 'contract_date',
    payoutDate: 'payout_date',
    endDate: 'end_date',
    status: 'status',
    bankName: 'bank_name',
    accountNo: 'account_no',
    accountOwner: 'account_owner',
  }
  const LABELS = {
    name: '계약자명',
    phone: '연락처',
    position: '직급',
    salary: '연봉',
    insuranceType: '소득구분',
    contractDate: '계약일',
    payoutDate: '급여일',
    endDate: '계약종료일',
    status: '계약상태',
    bankName: '은행/기관',
    accountNo: '계좌번호',
    accountOwner: '예금주',
  }

  const changes = []
  const sets = []
  const vals = []
  let i = 1
  for (const key of Object.keys(patch)) {
    const col = FIELD_TO_COLUMN[key]
    if (!col) continue
    const before = String(cur[key] ?? '')
    const after = String(patch[key] ?? '')
    if (before !== after) changes.push({ label: LABELS[key], before, after })
    sets.push(`${col} = $${i++}`)
    vals.push(patch[key])
  }
  if (sets.length) {
    vals.push(id)
    await pool.query(
      `UPDATE appointments SET ${sets.join(', ')} WHERE id = $${i}`,
      vals,
    )
  }
  if (changes.length) {
    await pool.query(
      `INSERT INTO appointment_history (appointment_id, edited_at, memo, changes)
       VALUES ($1,$2,$3,$4)`,
      [id, nn(meta?.editedAt) || new Date(), meta?.memo || '', JSON.stringify(changes)],
    )
  }
  return await getAppointment(id)
}

/** 제출서류 1건 추가 (Drive 업로드 후 링크 저장) */
async function addAppointmentDocument(id, doc) {
  const { rows } = await pool.query(
    `INSERT INTO appointment_documents (appointment_id, doc_type, file_name, drive_file_id, drive_view_url)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [id, doc.docType || '', doc.fileName, doc.driveFileId, doc.driveViewUrl],
  )
  return rows[0].id
}

/** 계약번호 자동생성 LASE-yyyymmdd-000 */
async function nextContractNo(dateISO) {
  const compact = (dateISO || '').replace(/-/g, '') || '00000000'
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM appointments`)
  return `LASE-${compact}-${String(rows[0].c + 1).padStart(3, '0')}`
}

module.exports = {
  listAppointments,
  getAppointment,
  createAppointment,
  updateAppointment,
  addAppointmentDocument,
  nextContractNo,
}
