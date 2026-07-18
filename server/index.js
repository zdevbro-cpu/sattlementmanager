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
const salesRepo = require('./salesRepo')
const extraPayoutRepo = require('./extraPayoutRepo')
const textbookRepo = require('./textbookRepo')
const drive = require('./services/driveService')
const ocr = require('./services/ocrService')
const pdfService = require('./services/pdfService')

const app = express()
app.use(cors())
app.use(express.json({ limit: '25mb' }))

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

// ── 교재구매 신청 관리 (교재구입 정보만 — 결제/입금은 매출관리에서 별도 처리) ──
app.get('/api/textbook-applications', async (req, res) => {
  try {
    const list = await textbookRepo.listApplications({
      startDate: req.query.startDate || '',
      endDate: req.query.endDate || '',
      buyer: req.query.buyer || '',
    })
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
    const a = await textbookRepo.createApplication(req.body)
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
