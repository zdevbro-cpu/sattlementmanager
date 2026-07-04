# lavenmanager — 집 환경 셋업 가이드

GitHub의 `zdevbro-cpu/lavenmanager` 저장소에는 안전상 비밀키·환경변수가 빠져 있습니다.
집에서 동일한 개발/배포 환경을 만들려면 이 폴더의 파일을 git clone 한 폴더에 그대로 복사하세요.

---

## 📁 이 폴더 구조 (모두 .gitignore 대상이라 GitHub에 없는 파일)

```
e:/lavenmanager/
├── README.md                         ← 이 파일
├── .env.production                   ← 프론트 빌드용 (Cloud Run API URL)
└── server/
    ├── .env                          ← DB·OAuth·Gemini·Drive 시크릿
    └── config/
        └── google-key.json           ← (구버전) 서비스 계정 키, 현재는 OAuth가 우선 동작하므로 사실상 미사용
```

> `client_secret_*.json` (OAuth Web 클라이언트 다운로드 파일)은 현재 폴더에 없지만, 그 안의 `client_id`/`client_secret` 값은 `server/.env`의 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`에 이미 들어있어 필요하면 그쪽에서 확인 가능합니다. 원본 JSON이 필요하면 https://console.cloud.google.com/apis/credentials?project=lavenmanager-497303 에서 재다운로드.

---

## 🛠 사전 준비 (한 번만)

### 1. CLI 도구 설치
- **Node.js 20+** : https://nodejs.org (또는 nvm-windows)
- **Git** : https://git-scm.com
- **gcloud CLI** : https://cloud.google.com/sdk/docs/install
- **Firebase CLI** : `npm install -g firebase-tools`
- **Python 3.x** : 로고 투명화 등 가공용 (선택)

### 2. Google 계정 로그인
이 프로젝트는 모두 `zdevbro@gmail.com` 계정에 묶여 있습니다.

```bash
gcloud auth login                                   # 브라우저로 zdevbro@gmail.com 선택
gcloud config set project lavenmanager-497303
firebase login                                       # 동일 계정
```

### 3. 접근 권한 확인
다음 두 프로젝트의 소유자/편집자여야 합니다:
- **GCP**: `lavenmanager-497303` (Cloud Run, Cloud SQL, Secret Manager, Drive API)
- **Firebase**: `lavenmanager` (Auth, Hosting)

---

## 🚀 신규 PC 셋업 절차

### 1. 저장소 클론

```bash
cd c:/ProjectCode      # 또는 원하는 위치
git clone https://github.com/zdevbro-cpu/lavenmanager.git
cd lavenmanager
```

### 2. 이 폴더 시크릿 복사

```bash
# Windows PowerShell 기준 (Git Bash도 동일)
cp e:/lavenmanager/.env.production       ./.env.production
cp e:/lavenmanager/server/.env           ./server/.env
mkdir -p server/config
cp e:/lavenmanager/server/config/google-key.json ./server/config/google-key.json
```

### 3. 의존성 설치

```bash
npm install                          # 프론트
cd server && npm install && cd ..    # 백엔드
```

### 4. Prisma 클라이언트 생성

```bash
cd server && npx prisma generate && cd ..
```

### 5. 한글 폰트 확인
PDF 생성에 맑은 고딕(`C:\Windows\Fonts\malgun.ttf`)이 필요합니다. Windows라면 기본 설치되어 있음. 없으면 `fontkit`이 Helvetica로 폴백되며 한글이 깨집니다.

### 6. 로컬 개발 서버 띄우기

```bash
npm run dev      # 프론트(5173) + 백엔드(3001) 동시 구동
# 또는 개별로:
npm run client   # vite dev (포트 5173)
npm run server   # nodemon (포트 3001)
```

브라우저: http://localhost:5173

---

## 📦 배포 명령

### 백엔드 (Cloud Run)

```bash
cd server
gcloud run deploy lavenmanager-api \
  --source . \
  --region=asia-northeast3 \
  --project=lavenmanager-497303 \
  --add-cloudsql-instances=lavenmanager-497303:asia-northeast3:lavenmanager-db \
  --quiet
```

### 프론트엔드 (Firebase Hosting)

```bash
npm run build
firebase deploy --only hosting --project=lavenmanager
```

배포 후 URL:
- Frontend: https://lavenmanager.web.app
- Backend: https://lavenmanager-api-171052749557.asia-northeast3.run.app

---

## 🔐 시크릿 관리 — Secret Manager (선택)

Cloud Run은 환경변수를 Secret Manager에서 자동 마운트합니다. 시크릿이 이미 모두 등록되어 있으므로 추가 작업 불필요. 값을 바꿔야 할 땐:

```bash
printf '새 값' | gcloud secrets versions add LAVEN_DATABASE_URL --data-file=- --project=lavenmanager-497303
```

등록된 6개 시크릿:
- `LAVEN_DATABASE_URL` (Cloud SQL 연결 문자열, Unix socket 형식)
- `LAVEN_GEMINI_API_KEY`
- `LAVEN_GOOGLE_CLIENT_ID`
- `LAVEN_GOOGLE_CLIENT_SECRET`
- `LAVEN_GOOGLE_REFRESH_TOKEN` (영구, 7일 만료 없음 — OAuth 게시 완료)
- `LAVEN_GOOGLE_DRIVE_FOLDER_ID` (참조용, 현재 코드는 앱이 만든 폴더 자동 발견하므로 미사용)

---

## ☁️ 외부 시스템 식별자 요약

| 항목 | 값 |
|---|---|
| GCP 프로젝트 | `lavenmanager-497303` (프로젝트 번호 171052749557) |
| Firebase 프로젝트 | `lavenmanager` |
| Cloud SQL 인스턴스 | `lavenmanager-db` (asia-northeast3-a, Postgres 15) |
| Cloud SQL 공인 IP | `34.47.94.25:5432` (로컬 개발용 직접 접속) |
| Cloud SQL 인스턴스 연결명 | `lavenmanager-497303:asia-northeast3:lavenmanager-db` |
| OAuth 게시 상태 | 프로덕션 (drive.file 비민감 범위) |
| Drive 앱 루트 폴더 | `에이멘에이_교재구매_신청서` (zdevbro@gmail.com 마이드라이브 최상단, 앱이 자동 생성) |
| 관리자 계정 (Firebase Auth) | `admin@las.com` / `admin123` |

---

## 🐛 자주 만나는 이슈

| 증상 | 원인 / 해결 |
|---|---|
| Cloud Run 배포 시 `EPERM rename` 에러 | 로컬 `server/node_modules` 재귀 심볼릭. `.gcloudignore`가 막아주지만 캐시 꼬이면 `rm -rf server/node_modules` 후 재시도 |
| PDF 한글 `WinAnsi cannot encode` 에러 | 폰트 못 찾음. Windows: `malgun.ttf` 확인 / Linux 컨테이너: Dockerfile의 `fonts-nanum` 설치 확인 |
| Drive 업로드 실패 `Service Accounts do not have storage quota` | 서비스 계정 모드 폴백됨. `.env`의 OAuth 3개 변수(`GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`)가 셋업되어 있는지 확인 |
| `Can't reach database server at 34.47.94.25:5432` (Cloud Run) | `--add-cloudsql-instances` 플래그 누락 또는 `DATABASE_URL`이 `host=/cloudsql/...` 형식이 아님 |
| Vite 빌드는 되는데 API 호출이 localhost로 감 | `.env.production`이 빌드 시점에 없음. 루트에 복사하고 `npm run build` 재실행 |

---

## 📝 관련 문서

- 코드/구조 상세: 저장소의 `README.md` (있다면) 또는 코드 직접 참조
- Google Cloud Console: https://console.cloud.google.com/?project=lavenmanager-497303
- Firebase Console: https://console.firebase.google.com/project/lavenmanager
