// Google Drive 파일 업로드 서비스 (독립 시스템)
// 레퍼런스: lavenmanager driveService.js (OAuth2 우선 + 서비스계정 폴백 + 로컬 폴백)
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

module.exports = { uploadFile, getDriveClient, LOCAL_DIR }
