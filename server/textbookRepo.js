// 교재구매 신청 관리 도메인 DB 레포지토리 (Cloud SQL / PostgreSQL)
// 교재구입 정보만 취급 — 결제/입금 관련 내용은 매출관리(salesRepo)에서 별도 처리한다.
const { pool } = require('./db')
const shipmentRepo = require('./shipmentRepo')

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
    createdByEmail: a.created_by_email || '',
    createdByBranch: a.created_by_branch || '',
    createdAt: isoDate(a.created_at),
  }
}

/**
 * 로그인 사용자의 조회 범위를 SQL 조건으로 만든다 — 화면이 아니라 서버가 강제한다.
 *   admin         → 전체
 *   store_manager → 자기 지점(점장은 산하 점주 신청건을 함께 본다)
 *   store_owner   → 본인이 올린 건만
 * 섭외 조직(파트너·파트장)은 교재 판매와 무관해 애초에 인가에서 걸러진다(middleware/auth.js).
 */
function scopeFor(user, alias = '') {
  const p = alias ? `${alias}.` : ''
  const roles = user?.roles || []
  if (roles.includes('admin')) return { sql: '', params: [] }
  if (roles.includes('store_manager')) {
    // 지점이 지정되지 않은 점장은 확장 조회 대상이 없다 — 본인 것만 보이게 둔다
    if (user.branch) return { sql: `${p}created_by_branch = $1`, params: [user.branch] }
    return { sql: `${p}created_by_email = $1`, params: [user.email || ''] }
  }
  return { sql: `${p}created_by_email = $1`, params: [user?.email || ''] }
}

function nn(v) {
  return v === '' || v === undefined ? null : v
}

/** 교재구매 신청 목록 (기간/구매자 필터)
 *  user 를 받으면 역할별 조회 범위를 SQL 단계에서 강제한다 — 점주가 남의 신청을 받아가면 안 된다.
 *  대장에서 결제·배송 진행을 한눈에 보도록 연결된 매출·배송 정보를 함께 붙인다. */
async function listApplications(filter = {}, user = null) {
  const scope = user ? scopeFor(user, 'a') : { sql: '', params: [] }
  const { rows } = await pool.query(
    `SELECT a.*,
            sa.id  AS sale_id,
            sa.payment_total AS sale_total,
            sh.id  AS shipment_id,
            sh.status AS shipment_status
       FROM textbook_applications a
       LEFT JOIN sales sa ON sa.textbook_application_id = a.id
       -- 구독은 신청 1건에 배송이 여러 회차 생긴다. 그냥 조인하면 신청이 회차 수만큼
       -- 중복 표시되므로, 가장 최근 배송건 하나만 붙인다.
       LEFT JOIN LATERAL (
         SELECT id, status FROM shipments
          WHERE textbook_application_id = a.id
          ORDER BY created_at DESC, id DESC LIMIT 1
       ) sh ON TRUE
      ${scope.sql ? 'WHERE ' + scope.sql : ''}
      ORDER BY a.created_at DESC`,
    scope.params,
  )
  const list = rows.map((r) => ({
    ...mapApplication(r),
    saleId: r.sale_id || '',
    saleTotal: Number(r.sale_total || 0),
    shipmentId: r.shipment_id || '',
    shipmentStatus: r.shipment_status || '',
  }))
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
  // COUNT(*)+1 방식은 중간 삭제가 있으면 이미 쓰는 id와 충돌한다 — MAX+1로 다음 번호를 구한다.
  const { rows: n } = await pool.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 2) AS INT)), 0)::int AS maxnum
       FROM textbook_applications WHERE id ~ '^T[0-9]+$'`,
  )
  const id = `T${String(n[0].maxnum + 1).padStart(4, '0')}`
  await pool.query(
    `INSERT INTO textbook_applications
       (id, apply_date, buyer_name, child_name, child_birthdate, phone, address, delivery_memo,
        book1_name, book2_name, subscription_type, management_type, seller_name, seller_phone,
        drive_photo_file_id, drive_photo_view_url, drive_pdf_file_id, drive_pdf_view_url,
        created_by_email, created_by_branch)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
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
      // 소유자·지점은 신청 시점 값으로 박아둔다(나중에 지점을 옮겨도 과거 건 조회 범위가 흔들리지 않는다)
      a.createdByEmail || '',
      a.createdByBranch || '',
    ],
  )
  const created = await getApplication(id)

  // 배송건 자동 생성 — 신청 저장과 트랜잭션을 묶지 않는다.
  // 신청 접수는 현장 최우선 경로이므로, 배송행 생성이 실패해도 신청은 성공 처리한다.
  // 누락된 건은 배송관리 대장에서 사후 보정한다(신청은 있는데 배송행이 없는 건 조회 → 수동 생성).
  try {
    await shipmentRepo.createFromApplication(created)
  } catch (e) {
    console.error('[shipment] 자동 생성 실패', id, e.message)
  }

  return created
}

/**
 * 배송 내부 상태(8종) → 신청자에게 보여줄 요약 상태.
 * 신청자에게 '목록확정'·'전송완료' 같은 내부 처리 단계는 의미가 없다.
 * 구매자가 물어보면 그대로 읽어줄 수 있는 말로 줄인다.
 */
function summaryStatus(s) {
  switch (s) {
    case '접수':
      return '접수됨'
    case '추후배송':
      return '배송지 확인 필요'
    case '목록확정':
    case '전송완료':
      return '발송 준비중'
    case '배송중':
      return '배송중'
    case '배송완료':
    case '완료확인':
      return '배송완료'
    case '취소':
      return '취소됨'
    default:
      return s || '접수됨'
  }
}

/**
 * 본인(또는 지점) 신청 내역 + 배송 상태 — 모바일 조회용.
 * 범위는 scopeFor 가 서버에서 강제한다. shipment_log(처리자 이메일 포함)는 노출하지 않는다.
 */
async function listMyApplications(user, filter = {}) {
  const scope = scopeFor(user, 'a')
  const where = []
  const params = [...scope.params]
  if (scope.sql) where.push(scope.sql)
  if (filter.keyword) {
    params.push(`%${filter.keyword}%`)
    const i = params.length
    where.push(`(a.buyer_name ILIKE $${i} OR a.child_name ILIKE $${i} OR a.phone ILIKE $${i} OR a.id ILIKE $${i})`)
  }
  const { rows } = await pool.query(
    `SELECT a.id, a.apply_date, a.buyer_name, a.child_name, a.phone, a.address,
            a.book1_name, a.book2_name, a.created_at,
            s.id AS shipment_id, s.status AS shipment_status, s.carrier, s.tracking_no
       FROM textbook_applications a
       -- 구독 다회차 대비 — 최신 배송건 하나만 붙인다(중복행 방지)
       LEFT JOIN LATERAL (
         SELECT id, status, carrier, tracking_no FROM shipments
          WHERE textbook_application_id = a.id
          ORDER BY created_at DESC, id DESC LIMIT 1
       ) s ON TRUE
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY a.created_at DESC, a.id DESC`,
    params,
  )
  return rows.map((r) => ({
    id: r.id,
    applyDate: isoDate(r.apply_date),
    buyerName: r.buyer_name || '',
    childName: r.child_name || '',
    phone: r.phone || '',
    address: r.address || '',
    book1Name: r.book1_name || '',
    book2Name: r.book2_name || '',
    createdAt: isoDate(r.created_at),
    shipmentId: r.shipment_id || '',
    // 내부 상태는 내보내지 않고 요약만 준다
    deliveryStatus: r.shipment_id ? summaryStatus(r.shipment_status) : '접수됨',
    carrier: r.carrier || '',
    trackingNo: r.tracking_no || '',
  }))
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
  listMyApplications,
  getApplication,
  createApplication,
  deleteApplication,
  setPhoto,
  setPdf,
}
