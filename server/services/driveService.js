// Google Drive 파일 업로드 서비스 (독립 시스템)
// OAuth2 우선 + 서비스계정 폴백 + 로컬 폴백
// 파일(계약서/전표/입금증)만 Drive에 저장하고, 링크는 Cloud SQL에 기록한다.

const { google } = require('googleapis')
const stream = require('stream')
const fs = require('fs')
const path = require('path')

const ROOT_FOLDER_ENV = process.env.GOOGLE_DRIVE_FOLDER_ID || ''
const LOCAL_DIR = path.join(__dirname, '..', 'uploads')

let cachedRootId = null

/** Drive 클라이언트 생성. 자격증명 없으면 null (→ 로컬 폴백) */
function getDriveClient() {
  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN,
    GOOGLE_APPLICATION_CREDENTIALS,
  } = process.env

  // 방식 A) OAuth2 사용자 모드
  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN) {
    const oauth2 = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
    )
    oauth2.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })
    return google.drive({ version: 'v3', auth: oauth2 })
  }

  // 방식 B) 서비스계정 (ADC / 키파일)
  if (GOOGLE_APPLICATION_CREDENTIALS) {
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/drive'],
    })
    return google.drive({ version: 'v3', auth })
  }

  return null
}

async function getOrCreateRootFolder(drive) {
  if (ROOT_FOLDER_ENV) return ROOT_FOLDER_ENV
  if (cachedRootId) return cachedRootId
  const name = 'SettlementManager_계약문서'
  const q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  const list = await drive.files.list({ q, fields: 'files(id,name)' })
  if (list.data.files && list.data.files.length) {
    cachedRootId = list.data.files[0].id
    return cachedRootId
  }
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  })
  cachedRootId = created.data.id
  return cachedRootId
}

async function getOrCreateYearFolder(drive, parentId, year) {
  const name = `${year}년`
  const q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`
  const list = await drive.files.list({ q, fields: 'files(id,name)' })
  if (list.data.files && list.data.files.length) return list.data.files[0].id
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  })
  return created.data.id
}

/**
 * 파일 버퍼 → Drive 업로드 → { driveFileId, driveViewUrl } 반환.
 * 자격증명 없으면 로컬 uploads/ 에 저장하고 합성 id 반환(개발 폴백).
 */
async function uploadFile({ filename, buffer, mimeType, year }) {
  const safeName = String(filename || 'file').replace(/[#[\]*?]/g, '_')
  const drive = getDriveClient()

  if (!drive) {
    // 로컬 폴백 (개발용, 자격증명 미설정 시)
    if (!fs.existsSync(LOCAL_DIR)) fs.mkdirSync(LOCAL_DIR, { recursive: true })
    const localName = `${Date.now()}_${safeName}`
    fs.writeFileSync(path.join(LOCAL_DIR, localName), buffer)
    return {
      driveFileId: `local_${localName}`,
      driveViewUrl: `/api/local-files/${encodeURIComponent(localName)}`,
      local: true,
    }
  }

  const rootId = await getOrCreateRootFolder(drive)
  const y = year || new Date().getFullYear()
  const yearId = await getOrCreateYearFolder(drive, rootId, y)
  const body = stream.Readable.from(buffer)
  const res = await drive.files.create({
    requestBody: { name: safeName, parents: [yearId] },
    media: { mimeType: mimeType || 'application/pdf', body },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  })
  return {
    driveFileId: res.data.id,
    driveViewUrl:
      res.data.webViewLink ||
      `https://drive.google.com/file/d/${res.data.id}/view`,
  }
}

/**
 * 파일 내용을 스트림으로 읽어온다 — 서버가 대신 받아 사용자에게 넘겨주기 위한 것.
 *
 * Drive 파일은 서비스 계정 소유라 사용자의 구글 계정에는 권한이 없다.
 * webViewLink 를 그대로 열면 "액세스 요청" 화면이 뜨므로, 파일을 공개로 바꾸는 대신
 * 서버가 서비스 계정 권한으로 받아서 중계한다(로그인한 사용자만 우리 API를 호출할 수 있다).
 *
 * 로컬 폴백으로 저장된 파일(driveFileId = 'local_...')은 디스크에서 읽는다.
 */
async function downloadFile(fileId) {
  const id = String(fileId || '')
  if (!id) throw new Error('파일 id가 없습니다.')

  if (id.startsWith('local_')) {
    const localName = id.slice('local_'.length)
    const full = path.join(LOCAL_DIR, localName)
    if (!fs.existsSync(full)) throw new Error('파일을 찾을 수 없습니다.')
    return { stream: fs.createReadStream(full), mimeType: '', name: localName }
  }

  const drive = getDriveClient()
  if (!drive) throw new Error('Drive 자격증명이 설정되지 않았습니다.')

  const meta = await drive.files.get({
    fileId: id,
    fields: 'name, mimeType',
    supportsAllDrives: true,
  })
  const res = await drive.files.get(
    { fileId: id, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  )
  return { stream: res.data, mimeType: meta.data.mimeType || '', name: meta.data.name || id }
}

module.exports = { uploadFile, downloadFile, getDriveClient, LOCAL_DIR }
