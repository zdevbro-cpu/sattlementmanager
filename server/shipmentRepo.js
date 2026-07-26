// 배송 레포지토리 — 교재구매 신청에서 파생된 배송 라이프사이클을 관리한다.
// textbookRepo.js 패턴을 따른다(ID는 MAX+1 채번, 매핑은 snake→camel, 날짜는 KST 변환).
const { pool } = require('./db')

/* ══════════════════════════════════════════════════════════
 * 상태 · 전이 규칙 (설계문서 §2.1 / §2.3)
 *
 * 접수 ─┬──────────────→ 목록확정 → 전송완료 → 배송중 → 배송완료 → 완료확인
 *       └→ 추후배송 ──↗
 *          (배송지 미확정)          └ (전송 전) → 취소
 * ══════════════════════════════════════════════════════════ */

const STATUS = {
  RECEIVED: '접수',
  DEFERRED: '추후배송',
  CONFIRMED: '목록확정',
  SENT: '전송완료',
  SHIPPING: '배송중',
  DELIVERED: '배송완료',
  CLOSED: '완료확인',
  CANCELED: '취소',
}

/** 허용 전이표 — 여기 없는 전이는 거부한다(접수→배송완료 같은 임의 점프 차단) */
const TRANSITIONS = {
  [STATUS.RECEIVED]: [STATUS.DEFERRED, STATUS.CONFIRMED, STATUS.CANCELED],
  [STATUS.DEFERRED]: [STATUS.CONFIRMED, STATUS.CANCELED],
  [STATUS.CONFIRMED]: [STATUS.DEFERRED, STATUS.SENT, STATUS.CANCELED],
  [STATUS.SENT]: [STATUS.SHIPPING],
  [STATUS.SHIPPING]: [STATUS.DELIVERED],
  // 배송완료 → 배송중: 오배송·반송 등 예외 복구 경로(메모 필수)
  [STATUS.DELIVERED]: [STATUS.SHIPPING, STATUS.CLOSED],
  [STATUS.CLOSED]: [], // 종료 상태
  [STATUS.CANCELED]: [], // 종료 상태
}

/** 상태 진입 시 함께 찍는 타임스탬프 컬럼 */
const STAMP_COLUMN = {
  [STATUS.SENT]: 'sent_to_logistics_at',
  [STATUS.SHIPPING]: 'shipped_at',
  [STATUS.DELIVERED]: 'delivered_at',
  [STATUS.CLOSED]: 'confirmed_at',
}

/** 목록확정에 필요한 배송지 필수 항목 — 하나라도 비면 확정할 수 없다 */
function missingAddressFields(s) {
  const missing = []
  if (!String(s.recipient_name || '').trim()) missing.push('수령인')
  if (!String(s.phone || '').trim()) missing.push('연락처')
  if (!String(s.address || '').trim()) missing.push('주소')
  return missing
}

function isoDate(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

function isoDateTime(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')
}

function mapShipment(s) {
  return {
    id: s.id,
    textbookApplicationId: s.textbook_application_id || '',
    recipientName: s.recipient_name || '',
    phone: s.phone || '',
    address: s.address || '',
    deliveryMemo: s.delivery_memo || '',
    book1Name: s.book1_name || '',
    book2Name: s.book2_name || '',
    status: s.status,
    carrier: s.carrier || '',
    trackingNo: s.tracking_no || '',
    batchId: s.batch_id || '',
    sentToLogisticsAt: isoDateTime(s.sent_to_logistics_at),
    shippedAt: isoDateTime(s.shipped_at),
    deliveredAt: isoDateTime(s.delivered_at),
    confirmedAt: isoDateTime(s.confirmed_at),
    memo: s.memo || '',
    createdAt: isoDate(s.created_at),
    updatedAt: isoDate(s.updated_at),
  }
}

function mapLog(l) {
  return {
    id: String(l.id),
    fromStatus: l.from_status || '',
    toStatus: l.to_status || '',
    actor: l.actor || '',
    memo: l.memo || '',
    createdAt: isoDateTime(l.created_at),
  }
}

/** 다음 ID — 중간 삭제가 있어도 충돌하지 않도록 COUNT 가 아니라 MAX+1 로 구한다 */
async function nextId(client) {
  const { rows } = await (client || pool).query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 2) AS INT)), 0)::int AS maxnum
       FROM shipments WHERE id ~ '^S[0-9]+$'`,
  )
  return `S${String(rows[0].maxnum + 1).padStart(4, '0')}`
}

/** 목록 — 기간(접수일)·상태·수령인·배치 필터 */
async function listShipments(filter = {}) {
  const { startDate, endDate, status, keyword, batchId } = filter
  const where = []
  const params = []
  const add = (sql, v) => {
    params.push(v)
    where.push(sql.replace('?', `$${params.length}`))
  }
  if (startDate) add(`created_at >= ?::date`, startDate)
  if (endDate) add(`created_at < (?::date + 1)`, endDate)
  if (status && status !== '전체') add(`status = ?`, status)
  if (batchId) add(`batch_id = ?`, batchId)
  if (keyword) {
    params.push(`%${keyword}%`)
    const i = params.length
    where.push(`(recipient_name ILIKE $${i} OR phone ILIKE $${i} OR address ILIKE $${i} OR id ILIKE $${i})`)
  }
  const { rows } = await pool.query(
    `SELECT * FROM shipments
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY created_at DESC, id DESC`,
    params,
  )
  return rows.map(mapShipment)
}

/** 단건 (+ 상태 전이 이력) */
async function getShipment(id) {
  const { rows } = await pool.query(`SELECT * FROM shipments WHERE id = $1`, [id])
  if (!rows.length) return null
  const { rows: logs } = await pool.query(
    `SELECT * FROM shipment_log WHERE shipment_id = $1 ORDER BY id DESC`,
    [id],
  )
  return { ...mapShipment(rows[0]), log: logs.map(mapLog) }
}

/**
 * 신청 접수 시 배송건 자동 생성 — 배송지/교재를 스냅샷으로 복사한다.
 * 접수 ≠ 배송이므로 배송지가 없으면 '추후배송'으로 시작한다(배송목록 전송 대상에서 제외).
 * app 은 textbookRepo 가 반환한 camelCase 객체를 그대로 받는다.
 */
async function createFromApplication(app) {
  const recipient = app.buyerName || ''
  const phone = app.phone || ''
  const address = app.address || ''
  // 수령인·연락처·주소가 모두 있어야 배송 대상으로 본다
  const ready = !!(recipient.trim() && phone.trim() && address.trim())
  const status = ready ? STATUS.RECEIVED : STATUS.DEFERRED

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const id = await nextId(client)
    const { rows } = await client.query(
      `INSERT INTO shipments
         (id, textbook_application_id, recipient_name, phone, address, delivery_memo,
          book1_name, book2_name, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        id,
        app.id || null,
        recipient,
        phone,
        address,
        app.deliveryMemo || '',
        app.book1Name || '',
        app.book2Name || '',
        status,
      ],
    )
    await client.query(
      `INSERT INTO shipment_log (shipment_id, from_status, to_status, actor, memo)
       VALUES ($1, NULL, $2, $3, $4)`,
      [id, status, 'system', ready ? '신청 접수로 자동 생성' : '배송지 미확정 — 추후배송으로 생성'],
    )
    await client.query('COMMIT')
    return mapShipment(rows[0])
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/**
 * 신규 배송 수동 등록 — 교재신청과 무관하게 배송건만 단독 생성한다(전화·방문 접수 등).
 * textbook_application_id 는 null 로 저장된다. 생성 규칙은 createFromApplication 과 동일.
 */
async function createShipment(s) {
  const recipient = s.recipientName || ''
  const phone = s.phone || ''
  const address = s.address || ''
  const ready = !!(recipient.trim() && phone.trim() && address.trim())
  // 배송지가 없으면 무조건 '추후배송'이다(목록확정 조건을 만족할 수 없다).
  // 배송지가 있어도 "나중에 보내달라"는 요청이 있으면 담당자가 '추후배송'을 고를 수 있어야 한다 —
  // 추후배송은 주소 유무가 아니라 '배송 시점 미정'이라는 업무 조건이다.
  const wanted = s.status === STATUS.DEFERRED ? STATUS.DEFERRED : STATUS.RECEIVED
  const status = ready ? wanted : STATUS.DEFERRED

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const id = await nextId(client)
    const { rows } = await client.query(
      `INSERT INTO shipments
         (id, textbook_application_id, recipient_name, phone, address, delivery_memo,
          book1_name, book2_name, carrier, tracking_no, memo, status)
       VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        id,
        recipient,
        phone,
        address,
        s.deliveryMemo || '',
        s.book1Name || '',
        s.book2Name || '',
        s.carrier || '',
        s.trackingNo || '',
        s.memo || '',
        status,
      ],
    )
    await client.query(
      `INSERT INTO shipment_log (shipment_id, from_status, to_status, actor, memo)
       VALUES ($1, NULL, $2, $3, $4)`,
      [id, status, s.actor || '', ready ? '수동 등록' : '배송지 미확정 — 추후배송으로 수동 등록'],
    )
    await client.query('COMMIT')
    return mapShipment(rows[0])
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/** 배송지·택배사·송장·메모 수정 (상태는 setStatus 로만 바꾼다) */
async function updateShipment(id, patch) {
  const allowed = {
    recipientName: 'recipient_name',
    phone: 'phone',
    address: 'address',
    deliveryMemo: 'delivery_memo',
    book1Name: 'book1_name',
    book2Name: 'book2_name',
    carrier: 'carrier',
    trackingNo: 'tracking_no',
    memo: 'memo',
  }
  const sets = []
  const params = [id]
  for (const [k, col] of Object.entries(allowed)) {
    if (patch[k] === undefined) continue
    params.push(patch[k] || '')
    sets.push(`${col} = $${params.length}`)
  }
  if (!sets.length) return getShipment(id)
  const { rows } = await pool.query(
    `UPDATE shipments SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
    params,
  )
  if (!rows.length) return null
  return mapShipment(rows[0])
}

/**
 * 상태 전이 — 전이표에 없는 전이는 거부하고, 모든 전이를 shipment_log 에 남긴다.
 * 목록확정 진입 시에는 배송지 필수 항목을 검증한다(미충족이면 거부).
 */
async function setStatus(id, toStatus, actor, memo) {
  if (!Object.values(STATUS).includes(toStatus)) {
    throw new Error(`알 수 없는 상태입니다: ${toStatus}`)
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // 동시 전이로 규칙이 깨지지 않도록 행을 잠그고 현재 상태를 읽는다
    const { rows } = await client.query(`SELECT * FROM shipments WHERE id = $1 FOR UPDATE`, [id])
    if (!rows.length) {
      await client.query('ROLLBACK')
      return null
    }
    const cur = rows[0]
    const from = cur.status

    if (from === toStatus) {
      await client.query('ROLLBACK')
      throw new Error(`이미 '${toStatus}' 상태입니다.`)
    }
    if (!(TRANSITIONS[from] || []).includes(toStatus)) {
      await client.query('ROLLBACK')
      throw new Error(`'${from}' 에서 '${toStatus}' 로는 변경할 수 없습니다.`)
    }
    if (toStatus === STATUS.CONFIRMED) {
      const missing = missingAddressFields(cur)
      if (missing.length) {
        await client.query('ROLLBACK')
        throw new Error(`배송지가 확정되지 않았습니다 (${missing.join('·')} 없음).`)
      }
    }
    // 배송완료 → 배송중은 예외 복구 경로라 사유를 남겨야 한다
    if (from === STATUS.DELIVERED && toStatus === STATUS.SHIPPING && !String(memo || '').trim()) {
      await client.query('ROLLBACK')
      throw new Error('배송완료를 되돌리려면 사유(메모)를 입력해야 합니다.')
    }

    const stamp = STAMP_COLUMN[toStatus]
    const { rows: upd } = await client.query(
      `UPDATE shipments SET status = $2${stamp ? `, ${stamp} = now()` : ''}, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [id, toStatus],
    )
    await client.query(
      `INSERT INTO shipment_log (shipment_id, from_status, to_status, actor, memo)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, from, toStatus, actor || '', memo || ''],
    )
    await client.query('COMMIT')
    return mapShipment(upd[0])
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

/**
 * 목록 전송 — 대상 건을 일괄 '전송완료'로 바꾸고 배치 식별자를 남긴다.
 * '목록확정' 건만 대상이다. 추후배송(배송지 미확정) 건은 애초에 포함될 수 없다.
 */
async function markSent(ids, batchId, actor) {
  if (!Array.isArray(ids) || !ids.length) return []
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `UPDATE shipments
          SET status = $3, batch_id = $2, sent_to_logistics_at = now(), updated_at = now()
        WHERE id = ANY($1) AND status = $4
        RETURNING *`,
      [ids, batchId, STATUS.SENT, STATUS.CONFIRMED],
    )
    for (const r of rows) {
      await client.query(
        `INSERT INTO shipment_log (shipment_id, from_status, to_status, actor, memo)
         VALUES ($1,$2,$3,$4,$5)`,
        [r.id, STATUS.CONFIRMED, STATUS.SENT, actor || '', `배송목록 전송 (배치 ${batchId})`],
      )
    }
    await client.query('COMMIT')
    return rows.map(mapShipment)
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

/**
 * 자동추적 대상 — 호출량을 줄이려고 범위를 좁힌다.
 *   · '배송중' 상태만 (접수·목록확정 건은 아직 송장이 없거나 발송 전이다)
 *   · 송장번호와 택배사가 모두 있는 건만
 *   · 발송 후 14일 지난 건은 제외 — 미아 건을 영원히 조회하지 않기 위함
 *   · 같은 건을 하루에 두 번 조회하지 않도록 최근 조회분은 건너뛴다
 */
async function listTrackingTargets({ maxAgeDays = 14, minIntervalHours = 12, limit = 200 } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM shipments
      WHERE status = $1
        AND COALESCE(tracking_no, '') <> ''
        AND COALESCE(carrier, '') <> ''
        AND COALESCE(shipped_at, created_at) > now() - ($2 || ' days')::interval
        AND (last_tracked_at IS NULL OR last_tracked_at < now() - ($3 || ' hours')::interval)
      ORDER BY COALESCE(last_tracked_at, 'epoch'::timestamptz) ASC
      LIMIT $4`,
    [STATUS.SHIPPING, String(maxAgeDays), String(minIntervalHours), limit],
  )
  return rows.map(mapShipment)
}

/** 조회 결과 기록 — 상태 전이 없이 추적 흔적만 남긴다(아직 배송중인 경우) */
async function recordTracking(id, { provider, statusText, raw }) {
  await pool.query(
    `UPDATE shipments
        SET tracking_provider = $2, tracking_status_text = $3, tracking_raw = $4,
            last_tracked_at = now(), updated_at = now()
      WHERE id = $1`,
    [id, provider || '', (statusText || '').slice(0, 100), raw ? JSON.stringify(raw) : null],
  )
}

/** 요약 카드용 집계 */
async function summarize() {
  const { rows } = await pool.query(`SELECT status, COUNT(*)::int AS c FROM shipments GROUP BY status`)
  const by = Object.fromEntries(rows.map((r) => [r.status, r.c]))
  const total = rows.reduce((a, r) => a + r.c, 0)
  return {
    total,
    deferred: by[STATUS.DEFERRED] || 0,
    waitingSend: (by[STATUS.RECEIVED] || 0) + (by[STATUS.CONFIRMED] || 0),
    shipping: by[STATUS.SHIPPING] || 0,
    done: (by[STATUS.DELIVERED] || 0) + (by[STATUS.CLOSED] || 0),
    byStatus: by,
  }
}

module.exports = {
  STATUS,
  listTrackingTargets,
  recordTracking,
  TRANSITIONS,
  listShipments,
  getShipment,
  createFromApplication,
  createShipment,
  updateShipment,
  setStatus,
  markSent,
  summarize,
}
