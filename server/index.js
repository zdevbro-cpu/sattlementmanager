// Settlement Manager 백엔드 API (독립 시스템)
// Express + Cloud SQL(PostgreSQL) + Google Drive(파일) + Gemini OCR(정보추출)
require('dotenv').config()

const express = require('express')
const cors = require('cors')
const multer = require('multer')
const nodemailer = require('nodemailer')
const path = require('path')
const fs = require('fs')

const { pool } = require('./db')
const repo = require('./contractRepo')
const appointmentRepo = require('./appointmentRepo')
const storeRepo = require('./storeRepo')
const staffRepo = require('./staffRepo')
const codesRepo = require('./codesRepo')
const salesRepo = require('./salesRepo')
const extraPayoutRepo = require('./extraPayoutRepo')
const textbookRepo = require('./textbookRepo')
const shipmentRepo = require('./shipmentRepo')
const drive = require('./services/driveService')
const ocr = require('./services/ocrService')
const pdfService = require('./services/pdfService')
const tracking = require('./services/trackingService')
const lasDirectory = require('./services/lasDirectory')
const { authenticate, authorize } = require('./middleware/auth')
const { auth } = require('./services/firebaseAdmin')

const app = express()
app.use(cors())
app.use(express.json({ limit: '25mb' }))

// 인증 — 모든 /api/* 는 Firebase ID 토큰이 필요하다.
// 예외: /api/health, POST /api/staff-requests(공개 가입요청), /api/cron/*·/api/admin/migrate(CRON_SECRET).
// AUTH_ENFORCE=true 전까지는 관찰 모드로 동작해 기존 클라이언트를 끊지 않는다(middleware/auth.js 참조).
app.use(authenticate)
// 인가 — 경로별 필요 역할은 middleware/auth.js 의 POLICY 한 곳에서 관리한다.
// 정책에 없는 신규 경로는 기본이 관리자 전용이다(누락 시 닫히는 방향).
app.use(authorize)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
})

// ── 헬스체크 ─────────────────────────────
app.get('/api/health', async (_req, res) => {
  let db = 'down'
  try {
    await pool.query('SELECT 1')
    db = 'up'
  } catch {
    db = 'down'
  }
  res.json({ ok: true, db, time: new Date().toISOString() })
})

// ── 로그인 사용자 본인 정보 (역할·소속) ─────────────────────────────
// 프론트 라우팅은 이 응답의 roles 로 분기한다. 예전처럼 전체 계정 목록(/api/staff)을
// 받아서 판정하지 않는다 — 일반 사용자에게 타인 이메일이 노출되지 않아야 한다.
app.get('/api/me', async (req, res) => {
  try {
    if (!req.user) {
      // 관찰 모드(AUTH_ENFORCE=false)에서 토큰이 없는 경우 — 기존 동작(관리자)을 유지한다
      return res.json({
        ok: true,
        data: { email: '', name: '', roles: ['admin'], isStaff: false, part: '', branch: '', canRegisterStore: false },
      })
    }
    const { email, name, roles, isStaff, part, branch, lasCode, canRegisterStore } = req.user
    res.json({
      ok: true,
      data: {
        email,
        name: name || '',
        roles,
        isStaff,
        part: part || '',
        branch: branch || '',
        lasCode: lasCode || '',
        canRegisterStore: !!canRegisterStore,
      },
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 계약 목록 ─────────────────────────────
app.get('/api/contracts', async (req, res) => {
  try {
    const list = await repo.listContracts({
      startDate: req.query.startDate || '',
      endDate: req.query.endDate || '',
      status: req.query.status || '전체',
      org: req.query.org || '전체',
      keyword: req.query.keyword || '',
    })
    res.json({ ok: true, data: list })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 계약 상세 ─────────────────────────────
app.get('/api/contracts/:id', async (req, res) => {
  try {
    const c = await repo.getContract(req.params.id)
    if (!c) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, data: c })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 신규 계약 등록 ─────────────────────────
app.post('/api/contracts', async (req, res) => {
  try {
    const c = await repo.createContract(req.body)
    res.status(201).json({ ok: true, data: c })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.delete('/api/contracts/:id', async (req, res) => {
  try {
    await repo.deleteContract(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 계약 이력 추가 (증액/양수/양도/해지/폐기 등) ──
app.post('/api/contracts/:id/history', async (req, res) => {
  try {
    const c = await repo.addHistory(req.params.id, req.body)
    if (!c) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, data: c })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 양수 처리 — 양수인 계약에 이력 추가 + 양도인 계약에 자동으로 '양도' 이력 추가 ──
app.post('/api/contracts/:id/transfer-in', async (req, res) => {
  try {
    const { transferorContractId, transferAmount, snap } = req.body
    if (!transferorContractId) return res.status(400).json({ ok: false, error: '양도인 계약을 선택하세요.' })
    const c = await repo.transferIn(req.params.id, transferorContractId, transferAmount || 0, snap)
    if (!c) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, data: c })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 계약 이력 오타수정 (새 이력행 추가 없이 기존 스냅샷을 그대로 고침) ──
app.patch('/api/contracts/:id/history/:historyId', async (req, res) => {
  try {
    await repo.correctHistory(req.params.historyId, req.body)
    const c = await repo.getContract(req.params.id)
    if (!c) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, data: c })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 파일(계약서/전표/입금증) → Google Drive 업로드 ──
// JSON base64 방식 (프론트 uploadToDrive 규격)
app.post('/api/contracts/:id/pdf', async (req, res) => {
  try {
    const { filename, data, mimeType, reason, kind, historyId } = req.body || {}
    if (!data) return res.status(400).json({ ok: false, error: 'no data' })
    const base64 = data.includes(',') ? data.split(',')[1] : data
    const buffer = Buffer.from(base64, 'base64')
    const up = await drive.uploadFile({
      filename,
      buffer,
      mimeType,
      year: new Date().getFullYear(),
    })
    await repo.addDocument(req.params.id, {
      historyId: historyId || null,
      kind: kind || '계약서',
      fileName: filename,
      driveFileId: up.driveFileId,
      driveViewUrl: up.driveViewUrl,
      reason,
    })
    res.json({ ok: true, ...up })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 임용계약(조직관리) 목록/상세/등록/이력/서류 ──
app.get('/api/appointments', async (req, res) => {
  try {
    const list = await appointmentRepo.listAppointments({
      keyword: req.query.keyword || '',
      startDate: req.query.startDate || '',
      endDate: req.query.endDate || '',
    })
    res.json({ ok: true, data: list })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/appointments/next-contract-no', async (req, res) => {
  try {
    const no = await appointmentRepo.nextContractNo(req.query.date || '')
    res.json({ ok: true, data: no })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/appointments/:id', async (req, res) => {
  try {
    const a = await appointmentRepo.getAppointment(req.params.id)
    if (!a) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, data: a })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/appointments', async (req, res) => {
  try {
    const a = await appointmentRepo.createAppointment(req.body)
    res.status(201).json({ ok: true, data: a })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.patch('/api/appointments/:id', async (req, res) => {
  try {
    const { patch, memo, editedAt } = req.body || {}
    const a = await appointmentRepo.updateAppointment(req.params.id, patch || {}, {
      memo,
      editedAt,
    })
    if (!a) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, data: a })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.delete('/api/appointments/:id', async (req, res) => {
  try {
    await appointmentRepo.deleteAppointment(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 스키마 마이그레이션 (schema.sql 재적용) ──
// CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD COLUMN IF NOT EXISTS 로만 구성되어 있어
// 반복 실행해도 기존 데이터에 영향이 없다. CRON_SECRET 으로 보호한다.
app.post('/api/admin/migrate', async (req, res) => {
  try {
    if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
      return res.status(403).json({ ok: false, error: 'forbidden' })
    }
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
    await pool.query(sql)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// 임용계약 제출서류 → Google Drive 업로드 + DB 기록 (JSON base64 방식)
app.post('/api/appointments/:id/document', async (req, res) => {
  try {
    const { filename, data, mimeType, docType } = req.body || {}
    if (!data) return res.status(400).json({ ok: false, error: 'no data' })
    const base64 = data.includes(',') ? data.split(',')[1] : data
    const buffer = Buffer.from(base64, 'base64')
    const name = docType
      ? `${req.params.id}_${docType}_${filename}`
      : filename
    const up = await drive.uploadFile({
      filename: name,
      buffer,
      mimeType,
      year: new Date().getFullYear(),
    })
    // 신규 등록 화면에서는 계약 저장 전이라 실제 appointment id가 아직 없을 수 있다
    // (그 경우 createAppointment()가 documents 배열을 받아 저장 시점에 연결한다).
    const existing = await appointmentRepo.getAppointment(req.params.id)
    if (existing) {
      await appointmentRepo.addAppointmentDocument(req.params.id, {
        docType,
        fileName: filename,
        driveFileId: up.driveFileId,
        driveViewUrl: up.driveViewUrl,
      })
    }
    res.json({
      ok: true,
      driveFileId: up.driveFileId,
      driveViewUrl: up.driveViewUrl,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── LAS-ON 매장선정관리 (매장 마스터/섭외이력) ──

// 선점 파트 선택용 파트장 이름 목록.
// 예전에는 화면에서 계약 원장 전체(/api/contracts)를 받아 이름만 추려 썼는데,
// 그러면 섭외 담당자에게 보증금·결제정보까지 통째로 내려간다. 이름만 반환한다.
app.get('/api/part-leaders', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT h.contractor_name AS name
         FROM contract_history h
         JOIN (SELECT contract_id, MAX(id) AS id FROM contract_history GROUP BY contract_id) latest
           ON latest.id = h.id
        WHERE h.contract_type = 'LAS-On파트장'
          AND h.status <> '폐기'
          AND COALESCE(h.contractor_name, '') <> ''
        ORDER BY 1`,
    )
    res.json({ ok: true, data: rows.map((r) => r.name) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/stores', async (req, res) => {
  try {
    const list = await storeRepo.listStores({
      keyword: req.query.keyword || '',
      status: req.query.status || '전체',
      phone: req.query.phone || '',
      bizNo: req.query.bizNo || '',
    })
    res.json({ ok: true, data: list })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// 중복 판정 후보 검색 — 등록 폼/간이조회에서 사용 (사업자번호 > 전화번호 > 매장명 순으로 비교)
app.get('/api/stores/check', async (req, res) => {
  try {
    const list = await storeRepo.findDuplicateCandidates({
      businessRegNo: req.query.bizNo || '',
      storePhone: req.query.phone || '',
      storeName: req.query.name || '',
    })
    res.json({ ok: true, data: list })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/stores/:id', async (req, res) => {
  try {
    const s = await storeRepo.getStore(req.params.id)
    if (!s) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, data: s })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/stores', async (req, res) => {
  try {
    const s = await storeRepo.createStore(req.body)
    res.status(201).json({ ok: true, data: s })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.patch('/api/stores/:id', async (req, res) => {
  try {
    const s = await storeRepo.updateStore(req.params.id, req.body)
    if (!s) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, data: s })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.delete('/api/stores/:id', async (req, res) => {
  try {
    await storeRepo.deleteStore(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/stores/:id/log', async (req, res) => {
  try {
    const s = await storeRepo.addRecruitmentLog(req.params.id, req.body)
    if (!s) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, data: s })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// 매장 사진 → Google Drive 업로드 + DB 기록 (JSON base64 방식)
app.post('/api/stores/:id/photo', async (req, res) => {
  try {
    const { filename, data, mimeType } = req.body || {}
    if (!data) return res.status(400).json({ ok: false, error: 'no data' })
    const base64 = data.includes(',') ? data.split(',')[1] : data
    const buffer = Buffer.from(base64, 'base64')
    const up = await drive.uploadFile({
      filename: `${req.params.id}_${filename}`,
      buffer,
      mimeType,
      year: new Date().getFullYear(),
    })
    const s = await storeRepo.addStorePhoto(req.params.id, {
      driveFileId: up.driveFileId,
      driveViewUrl: up.driveViewUrl,
    })
    res.json({ ok: true, data: s })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 시스템관리 공통코드 (소속/계약구분/상태/사업부/임용상태) — 공개 가입요청 페이지에서도 조회 가능 ──
app.get('/api/codes', async (req, res) => {
  try {
    const data = await codesRepo.listCodes()
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/codes', async (req, res) => {
  try {
    const data = await codesRepo.addCode(req.body.kind, req.body.value)
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.delete('/api/codes', async (req, res) => {
  try {
    const data = await codesRepo.removeCode(req.body.kind, req.body.value)
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/codes/reorder', async (req, res) => {
  try {
    const data = await codesRepo.reorderCode(req.body.kind, req.body.value, req.body.direction)
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 파트너 계정 관리 (현장 파트장/파트너) — 본인 가입요청 → 관리자 승인 ──
app.get('/api/staff', async (req, res) => {
  try {
    const list = await staffRepo.listStaff()
    res.json({ ok: true, data: list })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// 본인 가입 요청 제출 — 로그인 없이 접근 가능(프론트 /staff-request 공개 페이지)
app.post('/api/staff-requests', async (req, res) => {
  try {
    const r = await staffRepo.createRequest(req.body)
    res.status(201).json({ ok: true, data: r })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/staff-requests', async (req, res) => {
  try {
    const list = await staffRepo.listRequests(req.query.all === 'true')
    res.json({ ok: true, data: list })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// 가입 승인 — 계정 생성 + 비밀번호 설정 이메일 발송
app.post('/api/staff-requests/:id/approve', async (req, res) => {
  try {
    const result = await staffRepo.approveRequest(req.params.id)
    if (!result) return res.status(404).json({ ok: false, error: 'not found' })
    const mailer = getMailer()
    // 기존 계정에 역할만 추가된 경우(merged)는 비밀번호가 이미 있으므로 설정 메일을 보내지 않는다
    if (mailer && !result.merged && result.resetLink) {
      try {
        await mailer.sendMail({
          from: mailFrom(),
          to: result.staff.email,
          subject: 'Settlement Manager 계정 승인 안내',
          html: `<p>${result.staff.name}님, 가입 요청이 승인되었습니다.</p>
                 <p>아래 링크에서 비밀번호를 설정한 뒤 로그인해 주세요.</p>
                 <p><a href="${result.resetLink}">비밀번호 설정하기</a></p>`,
        })
      } catch (mailErr) {
        console.error('[staff] 승인 메일 발송 실패', mailErr.message)
      }
    }
    res.json({ ok: true, data: result.staff })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/staff-requests/:id/reject', async (req, res) => {
  try {
    const r = await staffRepo.rejectRequest(req.params.id)
    if (!r) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, data: r })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.patch('/api/staff/:id/status', async (req, res) => {
  try {
    const s = await staffRepo.setStaffStatus(req.params.id, req.body.status)
    if (!s) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, data: s })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/staff/:id/reset-password', async (req, res) => {
  try {
    const result = await staffRepo.resetStaffPassword(req.params.id)
    if (!result) return res.status(404).json({ ok: false, error: 'not found' })
    const mailer = getMailer()
    if (mailer) {
      try {
        await mailer.sendMail({
          from: mailFrom(),
          to: result.staff.email,
          subject: 'Settlement Manager 비밀번호 재설정 안내',
          html: `<p>${result.staff.name}님, 비밀번호 재설정이 요청되었습니다.</p>
                 <p>아래 링크에서 새 비밀번호를 설정해 주세요.</p>
                 <p><a href="${result.resetLink}">비밀번호 재설정하기</a></p>`,
        })
      } catch (mailErr) {
        console.error('[staff] 비밀번호 재설정 메일 발송 실패', mailErr.message)
      }
    }
    res.json({ ok: true, data: result.staff })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.patch('/api/staff/:id', async (req, res) => {
  try {
    const s = await staffRepo.updateStaff(req.params.id, req.body)
    if (!s) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, data: s })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.delete('/api/staff/:id', async (req, res) => {
  try {
    await staffRepo.deleteStaff(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 매출관리 목록/상세/등록/삭제/서류 ──
app.get('/api/sales', async (req, res) => {
  try {
    const list = await salesRepo.listSales({
      startDate: req.query.startDate || '',
      endDate: req.query.endDate || '',
      category: req.query.category || '전체',
      businessUnit: req.query.businessUnit || '',
      buyer: req.query.buyer || '',
      inputterOrg: req.query.inputterOrg || '',
      inputterName: req.query.inputterName || '',
    })
    res.json({ ok: true, data: list })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/sales/:id', async (req, res) => {
  try {
    const s = await salesRepo.getSale(req.params.id)
    if (!s) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, data: s })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/sales', async (req, res) => {
  try {
    const s = await salesRepo.createSale(req.body)
    res.status(201).json({ ok: true, data: s })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.patch('/api/sales/:id', async (req, res) => {
  try {
    const s = await salesRepo.updateSale(req.params.id, req.body)
    res.json({ ok: true, data: s })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.delete('/api/sales/:id', async (req, res) => {
  try {
    await salesRepo.deleteSale(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// 매출 전표/입금증 → Google Drive 업로드 + DB 기록
app.post('/api/sales/:id/document', async (req, res) => {
  try {
    const { filename, data, mimeType, kind } = req.body || {}
    if (!data) return res.status(400).json({ ok: false, error: 'no data' })
    const base64 = data.includes(',') ? data.split(',')[1] : data
    const buffer = Buffer.from(base64, 'base64')
    const up = await drive.uploadFile({
      filename,
      buffer,
      mimeType,
      year: new Date().getFullYear(),
    })
    await salesRepo.addSaleDocument(req.params.id, {
      kind: kind || '전표',
      fileName: filename,
      driveFileId: up.driveFileId,
      driveViewUrl: up.driveViewUrl,
    })
    res.json({ ok: true, ...up })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 지급관리 · 추가지급 대상자 ──
app.get('/api/extra-payouts', async (_req, res) => {
  try {
    const list = await extraPayoutRepo.listExtraPayouts()
    res.json({ ok: true, data: list })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/extra-payouts', async (req, res) => {
  try {
    const p = await extraPayoutRepo.createExtraPayout(req.body)
    res.status(201).json({ ok: true, data: p })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.delete('/api/extra-payouts/:id', async (req, res) => {
  try {
    await extraPayoutRepo.deleteExtraPayout(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 배송관리 (교재구매 신청 → 배송 라이프사이클) ──
// 신청 접수 시 배송건이 자동 생성되며(textbookRepo), 상태 전이는 규칙표 검증을 거친다.
app.get('/api/shipments', async (req, res) => {
  try {
    const list = await shipmentRepo.listShipments({
      startDate: req.query.startDate || '',
      endDate: req.query.endDate || '',
      status: req.query.status || '',
      keyword: req.query.keyword || '',
      batchId: req.query.batchId || '',
    })
    res.json({ ok: true, data: list })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// 신규 배송 수동 등록 — 교재신청과 무관한 배송건(전화·방문 접수 등)을 단독 생성한다.
app.post('/api/shipments', async (req, res) => {
  try {
    const s = await shipmentRepo.createShipment({ ...req.body, actor: req.user?.email || '' })
    res.status(201).json({ ok: true, data: s })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/shipments/summary', async (_req, res) => {
  try {
    res.json({ ok: true, data: await shipmentRepo.summarize() })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/shipments/:id', async (req, res) => {
  try {
    const s = await shipmentRepo.getShipment(req.params.id)
    if (!s) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, data: s })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.patch('/api/shipments/:id', async (req, res) => {
  try {
    const s = await shipmentRepo.updateShipment(req.params.id, req.body || {})
    if (!s) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, data: s })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// 상태 전이 — 규칙표에 없는 전이·배송지 미확정 확정 시도는 400 으로 거부한다(서버 오류가 아니다)
app.post('/api/shipments/:id/status', async (req, res) => {
  try {
    const { toStatus, memo } = req.body || {}
    if (!toStatus) return res.status(400).json({ ok: false, error: '변경할 상태가 없습니다.' })
    const actor = req.user?.email || ''
    const s = await shipmentRepo.setStatus(req.params.id, toStatus, actor, memo || '')
    if (!s) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, data: s })
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message })
  }
})

// ── 구독 정기발송 (구독·관리회원 — 2주 간격 1년) ──
// 신청 시 1년치를 한 번에 결제하므로 매출은 1건이고, 배송만 회차마다 생성된다.
app.post('/api/textbook-applications/:id/subscription', async (req, res) => {
  try {
    const a = await textbookRepo.startSubscription(req.params.id, req.body || {})
    if (!a) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, data: a })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// 일시정지·재개 — 재개하면 다음 예정일을 오늘 기준으로 다시 잡는다(밀린 회차를 몰아 보내지 않는다)
app.post('/api/textbook-applications/:id/subscription/pause', async (req, res) => {
  try {
    const a = await textbookRepo.pauseSubscription(req.params.id, !!req.body?.paused)
    if (!a) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, data: a })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// 해지 — 이후 회차를 만들지 않는다. 이미 나간 배송건은 건드리지 않는다.
app.post('/api/textbook-applications/:id/subscription/cancel', async (req, res) => {
  try {
    const a = await textbookRepo.cancelSubscription(req.params.id)
    if (!a) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, data: a })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 본인 신청·배송 조회 (모바일) ──
// 점주는 본인이 올린 건만, 점장은 자기 지점 건까지 본다. 범위는 서버가 강제한다(textbookRepo.scopeFor).
// 구매자가 배송을 문의하면 점주가 여기서 확인해 알려주는 흐름이라, 배송 상태는 요약해서 내려준다.
app.get('/api/my-applications', async (req, res) => {
  try {
    const list = await textbookRepo.listMyApplications(req.user || {}, {
      keyword: req.query.keyword || '',
    })
    res.json({ ok: true, data: list })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 교재구매 신청 관리 (교재구입 정보만 — 결제/입금은 매출관리에서 별도 처리) ──
app.get('/api/textbook-applications', async (req, res) => {
  try {
    // 조회 범위를 서버가 강제한다 — 점주는 본인 건, 점장은 자기 지점 건만 받는다
    const list = await textbookRepo.listApplications(
      {
        startDate: req.query.startDate || '',
        endDate: req.query.endDate || '',
        buyer: req.query.buyer || '',
      },
      req.user || null,
    )
    res.json({ ok: true, data: list })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/textbook-applications/:id', async (req, res) => {
  try {
    const a = await textbookRepo.getApplication(req.params.id)
    if (!a) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, data: a })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/textbook-applications', async (req, res) => {
  try {
    const { payment, ...applicationData } = req.body || {}
    // 소유자·지점은 클라이언트 값을 신뢰하지 않고 토큰에서 채운다 — 위조하면 남의 신청을 조회할 수 있다
    const a = await textbookRepo.createApplication({
      ...applicationData,
      createdByEmail: req.user?.email || '',
      createdByBranch: req.user?.branch || '',
    })
    // 신청 접수는 항상 성공 처리 — 매출 연결 실패는 로그만 남기고 신청 결과에 영향을 주지 않는다.
    if (payment && (payment.totalAmount || 0) > 0) {
      try {
        await salesRepo.createSale({
          date: a.applyDate,
          category: '교재구매',
          buyer: a.buyerName,
          inputterName: a.sellerName,
          source: 'textbook',
          textbookApplicationId: a.id,
          payment,
        })
      } catch (e) {
        console.error('[textbook-applications] 매출 연결 실패', a.id, e.message)
      }
    }
    res.status(201).json({ ok: true, data: a })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.delete('/api/textbook-applications/:id', async (req, res) => {
  try {
    await textbookRepo.deleteApplication(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// 수기 신청서 원본 사진 → Google Drive 업로드 + DB 기록
app.post('/api/textbook-applications/:id/photo', async (req, res) => {
  try {
    const { filename, data, mimeType } = req.body || {}
    if (!data) return res.status(400).json({ ok: false, error: 'no data' })
    const base64 = data.includes(',') ? data.split(',')[1] : data
    const buffer = Buffer.from(base64, 'base64')
    const up = await drive.uploadFile({
      filename,
      buffer,
      mimeType,
      year: new Date().getFullYear(),
    })
    await textbookRepo.setPhoto(req.params.id, up.driveFileId, up.driveViewUrl)
    res.json({ ok: true, ...up })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// 수기신청서가 없는 신청건 — 입력된 정보로 양식 PDF 생성 → Drive 업로드 + DB 기록
app.post('/api/textbook-applications/:id/generate-pdf', async (req, res) => {
  try {
    const a = await textbookRepo.getApplication(req.params.id)
    if (!a) return res.status(404).json({ ok: false, error: 'not found' })
    const buffer = await pdfService.generateApplicationPdf(a)
    const up = await drive.uploadFile({
      filename: `교재구매신청서_${a.buyerName}_${a.id}.pdf`,
      buffer,
      mimeType: 'application/pdf',
      year: new Date().getFullYear(),
    })
    await textbookRepo.setPdf(req.params.id, up.driveFileId, up.driveViewUrl)
    res.json({ ok: true, ...up })
  } catch (e) {
    console.error('[textbook-applications/generate-pdf] 실패:', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── OCR 정보추출 (카드전표/현금영수증) ──
app.post('/api/ocr', upload.single('photo'), async (req, res) => {
  try {
    const type = req.body.type || req.query.type || 'sales'
    let buffer = req.file ? req.file.buffer : null
    if (!buffer && req.body.imageBase64) {
      const b = req.body.imageBase64
      buffer = Buffer.from(b.includes(',') ? b.split(',')[1] : b, 'base64')
    }
    if (!buffer) return res.status(400).json({ ok: false, error: 'no image' })
    const mimeType = req.file ? req.file.mimetype : 'image/jpeg'
    const data = await ocr.analyzeImage(buffer, type, mimeType)
    res.json({ ok: true, data })
  } catch (e) {
    console.error('[api/ocr] 실패:', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 촬영 이미지(영수증/전표) → Google Drive 업로드 (소유 레코드 생성 전 업로드용) ──
app.post('/api/drive/upload', async (req, res) => {
  try {
    const { filename, data, mimeType } = req.body || {}
    if (!data) return res.status(400).json({ ok: false, error: 'no data' })
    const base64 = data.includes(',') ? data.split(',')[1] : data
    const buffer = Buffer.from(base64, 'base64')
    const up = await drive.uploadFile({
      filename,
      buffer,
      mimeType,
      year: new Date().getFullYear(),
    })
    res.json({ ok: true, ...up })
  } catch (e) {
    console.error('[api/drive/upload] 실패:', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 일일보고 이메일 발송 (엑셀 양식 첨부) ──
// Gmail 앱 비밀번호(GMAIL_APP_PASSWORD)가 설정되어 있으면 우선 사용,
// 없으면 범용 SMTP_HOST 설정으로 폴백한다.
function getMailer() {
  const { GMAIL_USER, GMAIL_APP_PASSWORD, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER || 'zdevbro@gmail.com', pass: GMAIL_APP_PASSWORD },
    })
  }
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
}
function mailFrom() {
  return process.env.GMAIL_APP_PASSWORD
    ? `"Settlement Manager 자동보고" <${process.env.GMAIL_USER || 'zdevbro@gmail.com'}>`
    : process.env.SMTP_FROM || process.env.SMTP_USER
}

const DEFAULT_REPORT_EMAILS =
  'gospress.dckwak@gmail.com, najulove76@naver.com, eunjooni@naver.com'

// ── 일일보고 수신 이메일 설정 (DB 저장 — cron에서도 참조) ──
app.get('/api/system/config/daily-report-email', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'daily_report_emails'`,
    )
    res.json({ ok: true, data: rows[0]?.value ?? DEFAULT_REPORT_EMAILS })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})
app.patch('/api/system/config/daily-report-email', async (req, res) => {
  try {
    const value = req.body?.value ?? ''
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('daily_report_emails', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [value],
    )
    res.json({ ok: true, data: value })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 직급별 기본급여 설정 (DB 저장 — 조직관리 등록/수정, 급여지급관리에서 참조) ──
app.get('/api/system/config/position-salaries', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'position_salaries'`,
    )
    res.json({ ok: true, data: rows[0]?.value ?? '' })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})
app.patch('/api/system/config/position-salaries', async (req, res) => {
  try {
    const value = req.body?.value ?? ''
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('position_salaries', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [value],
    )
    res.json({ ok: true, data: value })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 지점명(임용계약 소속지점) 목록 ──
// localStorage 로 두면 기기·사용자마다 목록이 달라지므로 Cloud SQL 에 보관한다.
app.get('/api/system/config/branches', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'branches'`,
    )
    res.json({ ok: true, data: rows[0]?.value ?? '' })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})
app.patch('/api/system/config/branches', async (req, res) => {
  try {
    const value = req.body?.value ?? ''
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('branches', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [value],
    )
    res.json({ ok: true, data: value })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 은행/기관 목록 (임용계약 등록의 InstitutionSelect) ──
app.get('/api/system/config/banks', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key = 'banks'`)
    res.json({ ok: true, data: rows[0]?.value ?? '' })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})
app.patch('/api/system/config/banks', async (req, res) => {
  try {
    const value = req.body?.value ?? ''
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('banks', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [value],
    )
    res.json({ ok: true, data: value })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 제출서류 종류 (임용계약 상세의 DocUploadList) ──
app.get('/api/system/config/doc-types', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key = 'doc_types'`)
    res.json({ ok: true, data: rows[0]?.value ?? '' })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})
app.patch('/api/system/config/doc-types', async (req, res) => {
  try {
    const value = req.body?.value ?? ''
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('doc_types', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [value],
    )
    res.json({ ok: true, data: value })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 매출구분(카드결제 분류 + 최대매수) ──
app.get('/api/system/config/sales-categories', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key = 'sales_categories'`)
    res.json({ ok: true, data: rows[0]?.value ?? '' })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})
app.patch('/api/system/config/sales-categories', async (req, res) => {
  try {
    const value = req.body?.value ?? ''
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('sales_categories', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [value],
    )
    res.json({ ok: true, data: value })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 정산 수수료율 ──
app.get('/api/system/config/settlement-fee-rate', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key = 'settlement_fee_rate'`)
    res.json({ ok: true, data: rows[0]?.value ?? '' })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})
app.patch('/api/system/config/settlement-fee-rate', async (req, res) => {
  try {
    const value = req.body?.value ?? ''
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('settlement_fee_rate', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [value],
    )
    res.json({ ok: true, data: value })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

const REPORT_TEMPLATE_PATH = path.join(__dirname, 'templates', 'daily_sales_report_template.xlsx')
const REPORT_DATA_START_ROW = 4
// 헤더: 번호 / 날짜 / 결재구분 / CAT ID / 사업부 / 구매자 / 내용 / 금액 / 카드사 / 카드번호 / 승인번호 / 담당

/** 매출 1건 → 결제 회차(카드/현금) 단위로 펼침. 분할결제 시 회차마다 1건씩 반환 */
function saleToLegs(s) {
  const legs = [
    ...(s.payment.cardInstallments || []).map((c) => ({
      method: '카드',
      amount: Number(c.amount || 0),
      issuer: c.issuer || '',
      cardNumber: c.cardNumber || '',
      approvalNo: c.approvalNo || '',
      terminalNo: c.terminalNo || '',
    })),
    ...(s.payment.cashInstallments || []).map((c) => ({
      method: '현금',
      amount: Number(c.amount || 0),
      issuer: c.bank || '', // 카드사/입금은행 컬럼 ← 입금은행명
      cardNumber: c.identifierNo || '',
      approvalNo: c.depositor || '', // 승인번호 컬럼 ← 입금자명
      terminalNo: '',
    })),
  ]
  if (legs.length > 0) return legs
  return [
    {
      method: s.payment.method === '현금' ? '현금' : '카드',
      amount: Number(s.payment.totalAmount || 0),
      issuer: '',
      cardNumber: '',
      approvalNo: '',
      terminalNo: '',
    },
  ]
}

/**
 * 매출 목록 → 출력행 계획. 단건은 1행, 분할결제는 합계행(굵게) + 회차행으로 펼친다.
 * 번호·날짜·사업부·구매자·내용·담당은 회차행도 공란 없이 합계행과 동일하게 채운다.
 * 결재구분만 회차행은 그 회차의 개별 결제수단(카드/현금)을 쓰고, 합계행은 전체 대표값
 * (카드/현금/카드+현금)을 쓴다.
 */
function buildSalesReportPlan(sales) {
  const plan = []
  let no = 0
  sales.forEach((s) => {
    const legs = saleToLegs(s)
    no++

    if (legs.length <= 1) {
      const only = legs[0]
      plan.push({
        no,
        date: s.date,
        method: only?.method || '',
        terminalNo: only?.terminalNo || '',
        businessUnit: s.businessUnit,
        buyer: s.buyer,
        category: s.category,
        amount: s.payment.totalAmount,
        issuer: only?.issuer || '',
        cardNumber: only?.cardNumber || '',
        approvalNo: only?.approvalNo || '',
        manager: s.manager,
      })
      return
    }

    const hasCard = legs.some((l) => l.method === '카드')
    const hasCash = legs.some((l) => l.method === '현금')
    const summaryMethod = hasCard && hasCash ? '카드+현금' : hasCard ? '카드' : '현금'

    plan.push({
      no,
      date: s.date,
      method: summaryMethod,
      businessUnit: s.businessUnit,
      buyer: s.buyer,
      category: s.category,
      amount: s.payment.totalAmount,
      manager: s.manager,
      bold: true,
    })
    legs.forEach((leg) => {
      plan.push({
        no,
        date: s.date,
        method: leg.method,
        terminalNo: leg.terminalNo,
        businessUnit: s.businessUnit,
        buyer: s.buyer,
        category: s.category,
        amount: leg.amount,
        issuer: leg.issuer,
        cardNumber: leg.cardNumber,
        approvalNo: leg.approvalNo,
        manager: s.manager,
      })
    })
  })
  return plan
}

/** 템플릿이 미리 갖춘, 테두리 서식이 있는 데이터 행 수 (R4~R100 = 97행) */
const REPORT_TEMPLATE_DATA_ROWS = 97

/**
 * 실제 필요한 행 수에 맞춰 템플릿 행을 늘리거나(서식 복제) 줄인다(초과분 삭제).
 * ExcelJS의 spliceRows는 "삭제 범위가 시트 끝까지 이어지는" 경우 아무 것도 지우지 못하는
 * 버그가 있어(내부 nKeep > nEnd 케이스 무시), 꼬리 행 제거는 내부 배열 길이를 직접 자른다.
 */
function resizeReportSheet(ws, total) {
  const templateLastRow = REPORT_DATA_START_ROW + REPORT_TEMPLATE_DATA_ROWS - 1 // R100

  if (total > REPORT_TEMPLATE_DATA_ROWS) {
    ws.duplicateRow(templateLastRow, total - REPORT_TEMPLATE_DATA_ROWS, true)
  }

  const keepThrough = REPORT_DATA_START_ROW + total - 1
  if (ws.rowCount > keepThrough) {
    ws._rows.length = keepThrough
  }
}

/**
 * 매출 목록 → "매출 일일 보고" 양식(server/templates)에 채운 워크북 반환.
 * 번호는 거래 단위 일련번호로 새로 생성하고, 분할결제 회차행도 합계행과 동일한 번호를 쓴다.
 * 데이터 행 수에 맞춰 템플릿 서식을 유지한 채 나머지 행은 삭제한다.
 */
async function buildSalesReportWorkbook(sales, label) {
  const ExcelJS = require('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(REPORT_TEMPLATE_PATH)
  const ws = wb.worksheets[0]
  ws.getCell('A1').value = `매출 일일 보고(교육사업부)   ·   ${label}`

  const plan = buildSalesReportPlan(sales)
  resizeReportSheet(ws, plan.length)

  const COL_COUNT = 12
  const HEADER_ROW = REPORT_DATA_START_ROW - 1 // 헤더(R3)부터 외곽선을 굵게 통일
  const OUTER_BORDER = 'medium'
  const lastDataRow = REPORT_DATA_START_ROW + Math.max(plan.length, 1) - 1

  plan.forEach((p, i) => {
    const row = ws.getRow(REPORT_DATA_START_ROW + i)
    const isGroupStart = i === 0 || plan[i - 1].no !== p.no
    const isGroupEnd = i === plan.length - 1 || plan[i + 1].no !== p.no
    const isTableStart = i === 0
    const isTableEnd = i === plan.length - 1

    row.getCell(1).value = p.no ?? null
    if (p.date !== undefined) row.getCell(2).value = p.date
    row.getCell(3).value = p.method ?? ''
    row.getCell(4).value = p.terminalNo ?? ''
    if (p.businessUnit !== undefined) row.getCell(5).value = p.businessUnit
    if (p.buyer !== undefined) row.getCell(6).value = p.buyer
    if (p.category !== undefined) row.getCell(7).value = p.category
    row.getCell(8).value = p.amount
    row.getCell(9).value = p.issuer ?? ''
    row.getCell(10).value = p.cardNumber ?? ''
    row.getCell(11).value = p.approvalNo ?? ''
    if (p.manager !== undefined) row.getCell(12).value = p.manager

    // 주의: 여러 셀 스타일(font/border 등)을 별도 대입으로 나눠서 쓰면 ExcelJS가 행이 많을 때
    // 스타일 테이블을 내부적으로 어긋나게 만드는 버그가 있다 — 반드시 style 객체 하나로 대입한다.
    for (let c = 1; c <= COL_COUNT; c++) {
      const cell = row.getCell(c)
      const originalNumFmt = cell.numFmt
      cell.style = {
        font: { ...cell.font, bold: !!p.bold },
        alignment: cell.alignment,
        numFmt: c === 8 ? '#,##0' : originalNumFmt,
        border: {
          top: { style: isTableStart ? OUTER_BORDER : isGroupStart ? 'double' : 'dotted' },
          bottom: { style: isTableEnd ? OUTER_BORDER : isGroupEnd ? 'double' : 'dotted' },
          left: { style: c === 1 ? OUTER_BORDER : 'thin' },
          right: { style: c === COL_COUNT ? OUTER_BORDER : 'thin' },
        },
      }
    }
    row.commit?.()
  })

  // 표 외곽(헤더 R3부터 데이터 마지막 행까지) 좌우 변을 한 단계 굵은 실선으로 통일
  for (let r = HEADER_ROW; r <= lastDataRow; r++) {
    const left = ws.getRow(r).getCell(1)
    left.border = { ...left.border, left: { style: OUTER_BORDER } }
    const right = ws.getRow(r).getCell(COL_COUNT)
    right.border = { ...right.border, right: { style: OUTER_BORDER } }
  }

  return wb
}

/**
 * 이번달 1일 00:00 KST ~ 금일 22:00 KST 마감 시각까지의 누적 보고 구간을 계산한다
 * (호출 시각 기준 가장 최근 마감 시점). 매일 같은 달 안에서는 1일 데이터가 계속 누적되고,
 * 월이 바뀌면 from이 새 달 1일로 초기화된다.
 */
function reportWindow() {
  const KST_OFFSET = 9 * 3600 * 1000
  const now = new Date()
  const kst = new Date(now.getTime() + KST_OFFSET)
  let to = new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), 22, 0, 0) - KST_OFFSET,
  )
  if (now < to) to = new Date(to.getTime() - 24 * 3600 * 1000)
  const toKst = new Date(to.getTime() + KST_OFFSET)
  const from = new Date(
    Date.UTC(toKst.getUTCFullYear(), toKst.getUTCMonth(), 1, 0, 0, 0) - KST_OFFSET,
  )
  return { from, to }
}
function kstDateLabel(d) {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

/** 계약(보증금 결재) → 일일보고용 매출 형태로 변환. 화면(salesStore.contractToSale)과 동일 규칙. */
function contractToReportSale(c) {
  const cur = c.current
  return {
    date: cur.contractDate, // 날짜 컬럼 = 계약일(매출일)
    category: '점주보증금',
    org: cur.org,
    businessUnit: cur.businessUnit,
    buyer: cur.contractorName,
    manager: cur.manager,
    createdAt: cur.createdAt, // 집계 기준 = 등록일
    payment: cur.payment,
  }
}

/** 등록일(createdAt) 기준으로 직접등록 매출 + 계약 연동 보증금 매출을 합쳐 반환 */
async function collectReportSales() {
  const direct = await salesRepo.listSales({})
  const contracts = await repo.listContracts({})
  const contractSales = contracts
    .filter((c) => c.current.payment.totalAmount > 0 && c.current.status !== '폐기')
    .map(contractToReportSale)
  return [...direct, ...contractSales]
}

// ── 매출 일일보고 자동 발송 (Cloud Scheduler → 매일 22:00 KST 호출) ──
// ── 점주 온보딩 (las-mgmt 명단 대조 → 계정 발급) ──
//
// las-mgmt 비밀번호는 쓰지 않는다(평문 저장이라 신뢰 불가). LAS 고유번호+이름은 "명단에 있는가"만
// 확인해 줄 뿐 "본인인가"는 확인하지 못하므로(고유번호는 순차 채번이라 추측 가능),
// 등록된 이메일로 비밀번호 설정 링크를 보내 메일 수신자만 계정을 열 수 있게 한다.
// 응답은 성공·실패를 구분하지 않는다 — 고유번호 존재 여부조차 노출하지 않기 위함이다.

const OWNER_VERIFY_MSG =
  '확인이 완료되면 등록된 이메일로 비밀번호 설정 안내를 보내드립니다. 메일이 오지 않으면 관리자에게 문의해 주세요.'

async function tooManyAttempts(ip, code) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE ip = $1)            AS by_ip,
       COUNT(*) FILTER (WHERE referral_code = $2) AS by_code
     FROM owner_verify_attempts
     WHERE created_at > now() - interval '1 hour'`,
    [ip, code],
  )
  return Number(rows[0].by_ip) >= 5 || Number(rows[0].by_code) >= 3
}

app.post('/api/owner/verify', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.ip || ''
  const code = String(req.body?.referralCode || '').trim().toUpperCase()
  const name = String(req.body?.name || '').trim()
  try {
    if (!code || !name) {
      return res.status(400).json({ ok: false, error: 'LAS 고유번호와 이름을 입력하세요.' })
    }
    if (await tooManyAttempts(ip, code)) {
      return res.status(429).json({ ok: false, error: '시도 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.' })
    }

    const owner = await lasDirectory.findOwnerByReferralCode(code, name)
    await pool.query(
      `INSERT INTO owner_verify_attempts (ip, referral_code, ok) VALUES ($1,$2,$3)`,
      [ip, code, !!owner],
    )
    // 불일치여도 같은 응답을 준다(고유번호 존재 여부 비노출)
    if (!owner) return res.json({ ok: true, data: { message: OWNER_VERIFY_MSG, sentTo: '' } })

    // 이미 계정이 있으면 새로 만들지 않고 안내만 한다 — 같은 사람이 두 계정으로 쪼개지면 안 된다
    const { rows: exist } = await pool.query(`SELECT id FROM staff_accounts WHERE email = $1`, [owner.email])
    if (exist.length) {
      return res.json({
        ok: true,
        data: { message: '이미 가입된 계정입니다. 로그인해 주세요.', sentTo: lasDirectory.maskEmail(owner.email) },
      })
    }

    const userRecord = await auth.createUser({ email: owner.email, displayName: owner.name })
    try {
      await pool.query(
        `INSERT INTO staff_accounts (id, name, phone, email, role, roles, branch, las_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [userRecord.uid, owner.name, owner.phone, owner.email, owner.role, [owner.role], owner.branch, owner.referralCode],
      )
    } catch (e) {
      await auth.deleteUser(userRecord.uid).catch(() => {})
      throw e
    }

    const resetLink = await auth.generatePasswordResetLink(owner.email)
    const mailer = getMailer()
    if (mailer) {
      try {
        await mailer.sendMail({
          from: mailFrom(),
          to: owner.email,
          subject: 'Settlement Manager 계정 안내',
          html: `<p>${owner.name}님, 확인이 완료되었습니다.</p>
                 <p>아래 링크에서 비밀번호를 설정한 뒤 로그인해 주세요.</p>
                 <p><a href="${resetLink}">비밀번호 설정하기</a></p>`,
        })
      } catch (mailErr) {
        console.error('[owner/verify] 메일 발송 실패', mailErr.message)
      }
    }
    res.json({ ok: true, data: { message: OWNER_VERIFY_MSG, sentTo: lasDirectory.maskEmail(owner.email) } })
  } catch (e) {
    console.error('[owner/verify] 실패:', e.message)
    // 내부 사유를 밖으로 흘리지 않는다
    res.status(500).json({ ok: false, error: '처리 중 오류가 발생했습니다. 관리자에게 문의해 주세요.' })
  }
})

// ── 물류업체 수신 이메일 설정 (배송목록 전송 대상) ──
const DEFAULT_DELIVERY_EMAILS = ''

app.get('/api/system/config/delivery-email', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key = 'delivery_recipient_emails'`)
    res.json({ ok: true, data: rows[0]?.value ?? DEFAULT_DELIVERY_EMAILS })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.patch('/api/system/config/delivery-email', async (req, res) => {
  try {
    const value = (req.body?.value ?? '').toString()
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('delivery_recipient_emails', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [value],
    )
    res.json({ ok: true, data: value })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

/** 배송목록 엑셀 — 물류업체가 그대로 쓰는 표라 열 순서를 임의로 바꾸지 않는다 */
async function buildShipmentListXlsx(rows) {
  const ExcelJS = require('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('배송목록')
  ws.columns = [
    { header: '접수번호', key: 'id', width: 12 },
    { header: '수령인', key: 'recipientName', width: 14 },
    { header: '연락처', key: 'phone', width: 16 },
    { header: '주소', key: 'address', width: 46 },
    { header: '배송메모', key: 'deliveryMemo', width: 24 },
    { header: '교재1', key: 'book1Name', width: 18 },
    { header: '교재2', key: 'book2Name', width: 18 },
  ]
  ws.getRow(1).eachCell((cell) => {
    // 스타일은 한 번에 대입한다 — 속성을 따로 주면 행이 많을 때 ExcelJS 내부 스타일 테이블이 뒤섞인다
    cell.style = {
      font: { bold: true },
      alignment: { horizontal: 'center', vertical: 'middle' },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } },
      border: {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' },
      },
    }
  })
  for (const r of rows) {
    ws.addRow({
      id: r.id,
      recipientName: r.recipientName,
      phone: r.phone,
      address: r.address,
      deliveryMemo: r.deliveryMemo,
      book1Name: r.book1Name,
      book2Name: r.book2Name,
    })
  }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

/**
 * 배송목록 전송 — '목록확정' 건을 엑셀로 만들어 물류업체에 메일로 보내고 일괄 '전송완료' 처리한다.
 * 메일 발송이 실패하면 상태를 바꾸지 않는다 — 보내지 않았는데 전송완료로 남으면 배송이 누락된다.
 * '추후배송'(배송지 미확정) 건은 markSent 단계에서 대상에서 제외된다.
 */
app.post('/api/shipments/send-list', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
    if (!ids.length) return res.status(400).json({ ok: false, error: '전송할 배송건을 선택하세요.' })

    const all = await shipmentRepo.listShipments({ status: '목록확정' })
    const targets = all.filter((s) => ids.includes(s.id))
    if (!targets.length) {
      return res.status(400).json({ ok: false, error: "'목록확정' 상태인 건이 없습니다. 먼저 목록확정 처리하세요." })
    }

    const { rows: cfg } = await pool.query(`SELECT value FROM app_settings WHERE key = 'delivery_recipient_emails'`)
    const emails = (cfg[0]?.value ?? '')
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))
    if (!emails.length) {
      return res.status(400).json({ ok: false, error: '물류업체 수신 이메일이 설정되지 않았습니다. 시스템관리에서 등록하세요.' })
    }

    const mailer = getMailer()
    if (!mailer) return res.status(500).json({ ok: false, error: '메일 발송 설정이 없습니다.' })

    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
    const buf = await buildShipmentListXlsx(targets)
    await mailer.sendMail({
      from: mailFrom(),
      to: emails.join(', '),
      subject: `[배송목록] ${today} · ${targets.length}건`,
      html: `<p>${today} 배송목록 ${targets.length}건을 전달드립니다.</p><p>첨부 파일을 확인해 주세요.</p>`,
      attachments: [{ filename: `배송목록_${today.replace(/-/g, '')}.xlsx`, content: buf }],
    })

    // 메일이 실제로 나간 뒤에만 상태를 옮긴다
    const batchId = `B${today.replace(/-/g, '')}-${Date.now().toString().slice(-5)}`
    const sent = await shipmentRepo.markSent(targets.map((s) => s.id), batchId, req.user?.email || '')
    res.json({ ok: true, data: { batchId, sent: sent.length, to: emails } })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 구독 정기발송 생성 (매일) ──
// 예정일이 도래한 구독의 다음 회차 배송건을 만든다. 26회차를 미리 만들지 않는 이유는
// 하루 20건이면 520행이 한꺼번에 쌓여 배송 대장을 쓸 수 없기 때문이다.
// 회차 번호에 유니크 제약이 있어 두 번 돌아도 중복 생성되지 않는다.
app.post('/api/cron/create-subscription-shipments', async (req, res) => {
  try {
    if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
      return res.status(403).json({ ok: false, error: 'forbidden' })
    }
    const r = await textbookRepo.createDueSubscriptionShipments()
    console.log(
      `[cron/subscription] 대상 ${r.targets} · 생성 ${r.created} · 종료 ${r.finished} · 실패 ${r.failed}`,
    )
    res.json({ ok: true, data: r })
  } catch (e) {
    console.error('[cron/create-subscription-shipments] 실패:', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 배송추적 자동화 (스마트택배 조회 API) ──
// 접수·송장발급은 수동이고, 송장번호가 등록된 뒤의 조회만 자동화한다.
// 호출량을 줄이려고 '배송중' + 송장 있음 + 최근 발송 건만 돌린다(shipmentRepo.listTrackingTargets).
// 외부 API가 실패해도 상태를 바꾸지 않고 넘어간다 — 수동 상태변경 경로는 항상 살아 있어야 한다.
app.post('/api/cron/track-shipments', async (req, res) => {
  try {
    if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
      return res.status(403).json({ ok: false, error: 'forbidden' })
    }
    const targets = await shipmentRepo.listTrackingTargets()
    let checked = 0
    let delivered = 0
    let failed = 0

    for (const s of targets) {
      const r = await tracking.track(s.carrier, s.trackingNo)
      if (!r) {
        failed += 1
        continue
      }
      checked += 1
      await shipmentRepo.recordTracking(s.id, r)
      if (r.delivered) {
        try {
          await shipmentRepo.setStatus(s.id, shipmentRepo.STATUS.DELIVERED, 'system', `자동추적: ${r.statusText}`)
          delivered += 1
        } catch (e) {
          // 전이 규칙에 걸리면(이미 다른 상태로 바뀐 경우 등) 기록만 남기고 넘어간다
          console.warn('[cron/track] 상태 전이 실패', s.id, e.message)
        }
      }
    }
    console.log(`[cron/track] 대상 ${targets.length} · 조회 ${checked} · 배송완료 ${delivered} · 실패 ${failed}`)
    res.json({ ok: true, data: { targets: targets.length, checked, delivered, failed } })
  } catch (e) {
    console.error('[cron/track-shipments] 실패:', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/cron/daily-sales-report', async (req, res) => {
  try {
    if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
      return res.status(403).json({ ok: false, error: 'forbidden' })
    }
    const { from, to } = reportWindow()
    const all = await collectReportSales()
    const inWindow = all.filter((s) => {
      const c = new Date(s.createdAt)
      return c >= from && c < to
    })

    const toLabel = kstDateLabel(to)
    const fromLabel = kstDateLabel(from)
    const rangeLabel = `${fromLabel} ~ ${toLabel}`
    const wb = await buildSalesReportWorkbook(inWindow, rangeLabel)
    const buf = await wb.xlsx.writeBuffer()

    const { rows: cfg } = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'daily_report_emails'`,
    )
    const emails = (cfg[0]?.value || DEFAULT_REPORT_EMAILS)
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter(Boolean)

    const mailer = getMailer()
    if (!mailer) {
      return res.status(500).json({ ok: false, error: '메일 발송 계정 미설정 (GMAIL_APP_PASSWORD)' })
    }
    await mailer.sendMail({
      from: mailFrom(),
      to: emails.join(','),
      subject: `[Settlement Manager] 매출 일일보고 ${toLabel}`,
      text: `이번달 1일(${fromLabel}) 이후 ~ 금일(${toLabel}) 오후 10:00까지 누적 매출을 취합하여 송부합니다.\n\n대상 건수: ${inWindow.length}건`,
      attachments: [
        {
          filename: `매출일일보고_${toLabel}.xlsx`,
          content: Buffer.from(buf),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
    })
    res.json({ ok: true, count: inWindow.length })
  } catch (e) {
    console.error('[cron/daily-sales-report] 실패:', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/report/send', async (req, res) => {
  try {
    const { date, emails, filename, xlsxBase64, summaryHtml } = req.body || {}
    if (!Array.isArray(emails) || emails.length === 0)
      return res.status(400).json({ ok: false, error: '수신자가 없습니다.' })
    if (!xlsxBase64)
      return res.status(400).json({ ok: false, error: '첨부 파일이 없습니다.' })
    const mailer = getMailer()
    if (!mailer)
      return res.json({
        ok: false,
        error: 'SMTP 미설정 — server/.env 의 GMAIL_APP_PASSWORD 또는 SMTP_HOST/SMTP_USER/SMTP_PASS 를 설정하세요.',
      })
    await mailer.sendMail({
      from: mailFrom(),
      to: emails.join(','),
      subject: `[A_카드 매출 일일 보고] ${date}`,
      html:
        summaryHtml ||
        `첨부된 <b>${date}</b> 카드매출 일일보고(엑셀)를 확인하세요.`,
      attachments: [
        {
          filename: filename || `A_카드매출일일보고_${date}.xlsx`,
          content: Buffer.from(xlsxBase64, 'base64'),
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 로컬 폴백 파일 서빙 (Drive 자격증명 미설정 시) ──
app.get('/api/local-files/:name', (req, res) => {
  const f = path.join(drive.LOCAL_DIR, path.basename(req.params.name))
  if (!fs.existsSync(f)) return res.status(404).end()
  res.sendFile(f)
})

const PORT = Number(process.env.PORT || 8787)
app.listen(PORT, () => {
  console.log(`[server] Settlement Manager API on http://127.0.0.1:${PORT}`)
})
