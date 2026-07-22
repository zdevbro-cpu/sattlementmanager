// LAS-ON 매장선정관리 도메인 레포지토리 (Cloud SQL / PostgreSQL)
// LAS-On_Store_Manager.md 요구사항서 Phase 1(관리자용 매장 마스터 관리) 대응
const { pool } = require('./db')

function isoDate(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

function nn(v) {
  return v === '' || v === undefined ? null : v
}

/** 전화번호 정규화 — 하이픈/공백 제거 후 비교용 */
function normalizePhone(v) {
  return (v || '').replace(/[^0-9]/g, '')
}

function mapStore(s, log, photos) {
  return {
    id: s.id,
    businessRegNo: s.business_reg_no || '',
    storePhone: s.store_phone || '',
    roadAddress: s.road_address || '',
    detailAddress: s.detail_address || '',
    lat: s.lat != null ? Number(s.lat) : undefined,
    lng: s.lng != null ? Number(s.lng) : undefined,
    storeName: s.store_name,
    businessType: s.business_type || '',
    totalArea: s.total_area || '',
    availableArea: s.available_area || '',
    floorLocation: s.floor_location || '',
    businessHours: s.business_hours || '',
    commercialNote: s.commercial_note || '',
    chainBrand: s.chain_brand || '',
    contactName: s.contact_name || '',
    contactPosition: s.contact_position || '',
    contactMobile: s.contact_mobile || '',
    decisionAuthority: s.decision_authority || '',
    progressStatus: s.progress_status || '',
    ceoConfirm: s.ceo_confirm || '',
    surveyDate: s.survey_date || '',
    status: s.status,
    claimedPart: s.claimed_part || '',
    claimedStaff: s.claimed_staff || '',
    claimedAt: isoDate(s.claimed_at),
    claimExpiresAt: isoDate(s.claim_expires_at),
    rejectReason: s.reject_reason || '',
    recontactAvailableAt: isoDate(s.recontact_available_at),
    memo: s.memo || '',
    createdBy: s.created_by || '',
    updatedBy: s.updated_by || '',
    createdAt: isoDate(s.created_at),
    updatedAt: isoDate(s.updated_at),
    log: (log || []).map((l) => ({
      id: String(l.id),
      part: l.part || '',
      staff: l.staff || '',
      contactDate: isoDate(l.contact_date),
      contactMethod: l.contact_method || '',
      result: l.result || '',
      nextAction: l.next_action || '',
      memo: l.memo || '',
      createdAt: isoDate(l.created_at),
    })),
    photos: (photos || []).map((p) => ({
      id: String(p.id),
      driveFileId: p.drive_file_id,
      driveViewUrl: p.drive_view_url,
      uploadedAt: isoDate(p.uploaded_at),
    })),
  }
}

/** 매장 목록 (검색 필터: 매장명/전화번호/사업자번호/상태) */
async function listStores(filter = {}) {
  const { rows: stores } = await pool.query(`SELECT * FROM store_master ORDER BY created_at DESC`)
  const result = []
  if (stores.length) {
    const ids = stores.map((s) => s.id)
    const [{ rows: allLog }, { rows: allPhotos }] = await Promise.all([
      pool.query(
        `SELECT * FROM store_recruitment_log WHERE store_id = ANY($1) ORDER BY store_id, id DESC`,
        [ids],
      ),
      pool.query(`SELECT * FROM store_photos WHERE store_id = ANY($1) ORDER BY store_id, id`, [ids]),
    ])
    const logByStore = new Map()
    for (const l of allLog) {
      if (!logByStore.has(l.store_id)) logByStore.set(l.store_id, [])
      logByStore.get(l.store_id).push(l)
    }
    const photosByStore = new Map()
    for (const p of allPhotos) {
      if (!photosByStore.has(p.store_id)) photosByStore.set(p.store_id, [])
      photosByStore.get(p.store_id).push(p)
    }
    for (const s of stores) {
      result.push(mapStore(s, logByStore.get(s.id) || [], photosByStore.get(s.id) || []))
    }
  }
  const { keyword, status, phone, bizNo } = filter
  return result.filter((s) => {
    if (status && status !== '전체' && s.status !== status) return false
    if (keyword && !s.storeName.includes(keyword) && !s.contactName.includes(keyword)) return false
    if (phone && normalizePhone(s.storePhone) !== normalizePhone(phone)) return false
    if (bizNo && s.businessRegNo.replace(/-/g, '') !== bizNo.replace(/-/g, '')) return false
    return true
  })
}

/** 단일 매장 (접촉이력·사진 포함) */
async function getStore(id) {
  const { rows: sr } = await pool.query(`SELECT * FROM store_master WHERE id = $1`, [id])
  if (!sr.length) return null
  const { rows: log } = await pool.query(
    `SELECT * FROM store_recruitment_log WHERE store_id = $1 ORDER BY id DESC`,
    [id],
  )
  const { rows: photos } = await pool.query(
    `SELECT * FROM store_photos WHERE store_id = $1 ORDER BY id`,
    [id],
  )
  return mapStore(sr[0], log, photos)
}

/**
 * 중복 판정 후보 검색 — 등록/간이조회 시 사용.
 * 우선순위: 사업자등록번호 일치 > 정규화 전화번호 일치 > 매장명 부분일치(주소 비교는 프론트에서 목록 보고 판단)
 */
async function findDuplicateCandidates({ businessRegNo, storePhone, storeName }) {
  const { rows: stores } = await pool.query(`SELECT * FROM store_master ORDER BY created_at DESC`)
  const normPhone = normalizePhone(storePhone)
  const normBizNo = (businessRegNo || '').replace(/-/g, '')
  const nameKw = (storeName || '').replace(/\s+/g, '')
  const matches = stores.filter((s) => {
    if (normBizNo && (s.business_reg_no || '').replace(/-/g, '') === normBizNo) return true
    if (normPhone && normalizePhone(s.store_phone) === normPhone) return true
    if (nameKw && (s.store_name || '').replace(/\s+/g, '').includes(nameKw)) return true
    return false
  })
  return Promise.all(matches.map((s) => getStore(s.id)))
}

/** 신규 매장 등록 */
async function createStore(data) {
  const { rows: n } = await pool.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 3) AS INT)), 0)::int AS maxnum
       FROM store_master WHERE id ~ '^ST[0-9]+$'`,
  )
  const id = `ST${String(n[0].maxnum + 1).padStart(3, '0')}`
  await pool.query(
    `INSERT INTO store_master
       (id, business_reg_no, store_phone, road_address, detail_address, lat, lng, store_name,
        business_type, total_area, available_area, floor_location, business_hours, commercial_note,
        chain_brand, contact_name, contact_position, contact_mobile, decision_authority,
        progress_status, ceo_confirm, survey_date,
        status, memo, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
    [
      id,
      data.businessRegNo || '',
      data.storePhone || '',
      data.roadAddress || '',
      data.detailAddress || '',
      data.lat ?? null,
      data.lng ?? null,
      data.storeName,
      data.businessType || '',
      data.totalArea || '',
      data.availableArea || '',
      data.floorLocation || '',
      data.businessHours || '',
      data.commercialNote || '',
      data.chainBrand || '',
      data.contactName || '',
      data.contactPosition || '',
      data.contactMobile || '',
      data.decisionAuthority || '',
      data.progressStatus || '',
      data.ceoConfirm || '',
      data.surveyDate || '',
      data.status || '신규등록',
      data.memo || '',
      data.createdBy || '',
      data.createdBy || '',
    ],
  )
  return getStore(id)
}

/** 매장 정보 수정 */
async function updateStore(id, data) {
  const { rowCount } = await pool.query(
    `UPDATE store_master SET
       business_reg_no=$2, store_phone=$3, road_address=$4, detail_address=$5, lat=$6, lng=$7,
       store_name=$8, business_type=$9, total_area=$10, available_area=$11, floor_location=$12,
       business_hours=$13, commercial_note=$14, chain_brand=$15, contact_name=$16, contact_position=$17,
       contact_mobile=$18, decision_authority=$19, status=$20, claimed_part=$21, claimed_staff=$22,
       claimed_at=$23, claim_expires_at=$24, reject_reason=$25, recontact_available_at=$26,
       memo=$27, updated_by=$28, progress_status=$29, ceo_confirm=$30, survey_date=$31, updated_at=now()
     WHERE id=$1`,
    [
      id,
      data.businessRegNo || '',
      data.storePhone || '',
      data.roadAddress || '',
      data.detailAddress || '',
      data.lat ?? null,
      data.lng ?? null,
      data.storeName,
      data.businessType || '',
      data.totalArea || '',
      data.availableArea || '',
      data.floorLocation || '',
      data.businessHours || '',
      data.commercialNote || '',
      data.chainBrand || '',
      data.contactName || '',
      data.contactPosition || '',
      data.contactMobile || '',
      data.decisionAuthority || '',
      data.status || '신규등록',
      data.claimedPart || '',
      data.claimedStaff || '',
      nn(data.claimedAt),
      nn(data.claimExpiresAt),
      data.rejectReason || '',
      nn(data.recontactAvailableAt),
      data.memo || '',
      data.updatedBy || '',
      data.progressStatus || '',
      data.ceoConfirm || '',
      data.surveyDate || '',
    ],
  )
  if (rowCount === 0) return null
  return getStore(id)
}

/** 매장 삭제 (이력·사진은 FK ON DELETE CASCADE로 함께 삭제) */
async function deleteStore(id) {
  await pool.query(`DELETE FROM store_master WHERE id = $1`, [id])
}

/** 섭외 접촉이력 1건 추가 */
async function addRecruitmentLog(storeId, log) {
  await pool.query(
    `INSERT INTO store_recruitment_log (store_id, part, staff, contact_date, contact_method, result, next_action, memo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      storeId,
      log.part || '',
      log.staff || '',
      nn(log.contactDate),
      log.contactMethod || '',
      log.result || '',
      log.nextAction || '',
      log.memo || '',
    ],
  )
  return getStore(storeId)
}

/** 매장 사진 1건 추가 (Drive 업로드 후 링크 저장) */
async function addStorePhoto(storeId, photo) {
  await pool.query(
    `INSERT INTO store_photos (store_id, drive_file_id, drive_view_url) VALUES ($1,$2,$3)`,
    [storeId, photo.driveFileId, photo.driveViewUrl],
  )
  return getStore(storeId)
}

module.exports = {
  listStores,
  getStore,
  findDuplicateCandidates,
  createStore,
  updateStore,
  deleteStore,
  addRecruitmentLog,
  addStorePhoto,
}
