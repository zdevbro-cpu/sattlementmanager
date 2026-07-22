// Firebase Admin SDK — 파트너 계정(이메일/비밀번호) 생성·활성화 관리 전용.
// Cloud Run 기본 서비스 계정의 ADC(Application Default Credentials)로 초기화한다.
const admin = require('firebase-admin')

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'lassettlemanager' })
}

module.exports = { auth: admin.auth() }
