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
const drive = require('./services/driveService')
const ocr = require('./services/ocrService')

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
    const data = await ocr.analyzeImage(buffer, type)
    res.json({ ok: true, data })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── 일일보고 이메일 발송 (엑셀 양식 첨부) ──
function getMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
}

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
        error: 'SMTP 미설정 — server/.env 의 SMTP_HOST/SMTP_USER/SMTP_PASS 를 설정하세요.',
      })
    await mailer.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
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
