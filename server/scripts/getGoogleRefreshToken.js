// 구글 드라이브 OAuth2 리프레시 토큰 재발급 도구 (1회성 실행)
// 사용: node scripts/getGoogleRefreshToken.js
// 브라우저에서 http://localhost:3001/api/auth/google 접속 → zdevbro@gmail.com 로그인/동의
// → 발급된 refresh_token을 server/.env 의 GOOGLE_REFRESH_TOKEN에 자동 반영
//
// 주의: 리디렉션 URI는 기존(lavenmanager) OAuth 클라이언트에 이미 등록된
// http://localhost:3001/api/auth/google/callback 을 그대로 사용한다 (Console 변경 불필요).
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const express = require('express')
const { google } = require('googleapis')

const REDIRECT_URI = 'http://localhost:3001/api/auth/google/callback'
const ENV_PATH = path.join(__dirname, '..', '.env')

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET

if (!clientId || !clientSecret) {
  console.error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET이 server/.env에 없습니다.')
  process.exit(1)
}

function writeRefreshToken(token) {
  let env = fs.readFileSync(ENV_PATH, 'utf8')
  if (/^GOOGLE_REFRESH_TOKEN=.*$/m.test(env)) {
    env = env.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, `GOOGLE_REFRESH_TOKEN=${token}`)
  } else {
    env += `\nGOOGLE_REFRESH_TOKEN=${token}\n`
  }
  fs.writeFileSync(ENV_PATH, env)
}

const app = express()

app.get('/api/auth/google', (_req, res) => {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file'],
  })
  res.redirect(url)
})

app.get('/api/auth/google/callback', async (req, res) => {
  const { code } = req.query
  if (!code) return res.status(400).send('인증 코드가 없습니다.')
  try {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
    const { tokens } = await oauth2Client.getToken(code)
    if (!tokens.refresh_token) {
      return res.status(500).send(
        'refresh_token이 발급되지 않았습니다. 기존 승인을 취소 후(https://myaccount.google.com/permissions) 다시 시도하세요.'
      )
    }
    writeRefreshToken(tokens.refresh_token)
    res.send(`
      <div style="font-family:sans-serif;padding:40px;background:#0f172a;color:#f8fafc">
        <h2 style="color:#38bdf8">재인증 완료</h2>
        <p>server/.env 의 GOOGLE_REFRESH_TOKEN이 자동으로 갱신되었습니다.</p>
        <p style="color:#94a3b8;font-size:13px">이 창과 터미널(node 프로세스)을 종료해도 됩니다.</p>
      </div>
    `)
    console.log('[getGoogleRefreshToken] server/.env 에 GOOGLE_REFRESH_TOKEN 갱신 완료')
  } catch (e) {
    res.status(500).send('토큰 교환 실패: ' + e.message)
  }
})

app.listen(3001, () => {
  console.log('브라우저에서 http://localhost:3001/api/auth/google 접속하여 zdevbro@gmail.com 계정으로 재인증하세요.')
})
