// 교재구매 신청 관리 도메인 DB 레포지토리 (Cloud SQL / PostgreSQL)
// 교재구입 정보만 취급 — 결제/입금 관련 내용은 매출관리(salesRepo)에서 별도 처리한다.
const { pool } = require('./db')

/** DATE/TIMESTAMPTZ 값 → YYYY-MM-DD (KST 기준) */
function isoDate(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

function mapApplication(a) {
  return {
    id: a.id,
    applyDate: isoDate(a.apply_date),
    buyerName: a.buyer_name || '',
    childName: a.child_name || '',
    childBirthdate: a.child_birthdate || '',
    phone: a.phone || '',
    address: a.address || '',
    deliveryMemo: a.delivery_memo || '',
    book1Name: a.book1_name || '',
    book2Name: a.book2_name || '',
    subscriptionType: a.subscription_type || '',
    managementType: a.management_type || '',
    sellerName: a.seller_name || '',
    sellerPhone: a.seller_phone || '',
    drivePhotoFileId: a.drive_photo_file_id || '',
    drivePhotoViewUrl: a.drive_photo_view_url || '',
    drivePdfFileId: a.drive_pdf_file_id || '',
    drivePdfViewUrl: a.drive_pdf_view_url || '',
    createdAt: isoDate(a.created_at),
  }
}

function nn(v) {
  return v === '' || v === undefined ? null : v
}

/** 교재구매 신청 목록 (기간/구매자 필터) */
async function listApplications(filter = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM textbook_applications ORDER BY created_at DESC`,
  )
  const list = rows.map(mapApplication)
  const { startDate, endDate, buyer } = filter
  return list.filter((a) => {
    if (startDate && a.applyDate && a.applyDate < startDate) return false
    if (endDate && a.applyDate && a.applyDate > endDate) return false
    if (buyer && !a.buyerName.includes(buyer)) return false
    return true
  })
}

async function getApplication(id) {
  const { rows } = await pool.query(`SELECT * FROM textbook_applications WHERE id = $1`, [id])
  if (!rows.length) return null
  return mapApplication(rows[0])
}

/** 신규 교재구매 신청 등록 */
async function createApplication(a) {
  const { rows: n } = await pool.query(`SELECT COUNT(*)::int AS c FROM textbook_applications`)
  const id = `T${String(n[0].c + 1).padStart(4, '0')}`
  await pool.query(
    `INSERT INTO textbook_applications
       (id, apply_date, buyer_name, child_name, child_birthdate, phone, address, delivery_memo,
        book1_name, book2_name, subscription_type, management_type, seller_name, seller_phone,
        drive_photo_file_id, drive_photo_view_url, drive_pdf_file_id, drive_pdf_view_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      id,
      nn(a.applyDate),
      a.buyerName || '',
      a.childName || '',
      a.childBirthdate || '',
      a.phone || '',
      a.address || '',
      a.deliveryMemo || '',
      a.book1Name || '',
      a.book2Name || '',
      a.subscriptionType || '',
      a.managementType || '',
      a.sellerName || '',
      a.sellerPhone || '',
      a.drivePhotoFileId || null,
      a.drivePhotoViewUrl || null,
      a.drivePdfFileId || null,
      a.drivePdfViewUrl || null,
    ],
  )
  return getApplication(id)
}

async function deleteApplication(id) {
  await pool.query(`DELETE FROM textbook_applications WHERE id = $1`, [id])
}

/** 수기신청서 사진 업로드 결과 반영 */
async function setPhoto(id, driveFileId, driveViewUrl) {
  await pool.query(
    `UPDATE textbook_applications SET drive_photo_file_id = $2, drive_photo_view_url = $3 WHERE id = $1`,
    [id, driveFileId, driveViewUrl],
  )
  return getApplication(id)
}

/** 양식 기반 생성 PDF 업로드 결과 반영 */
async function setPdf(id, driveFileId, driveViewUrl) {
  await pool.query(
    `UPDATE textbook_applications SET drive_pdf_file_id = $2, drive_pdf_view_url = $3 WHERE id = $1`,
    [id, driveFileId, driveViewUrl],
  )
  return getApplication(id)
}

module.exports = {
  listApplications,
  getApplication,
  createApplication,
  deleteApplication,
  setPhoto,
  setPdf,
}
