-- ══════════════════════════════════════════════════════════════
-- Settlement Manager · 계약관리 스키마 (Cloud SQL / PostgreSQL)
--   · 구조화 데이터(계약/이력/결재/분할) → 이 DB
--   · 파일(계약서/전표/입금증) 실물 → Google Drive, 여기엔 링크(drive_file_id)만 저장
-- ══════════════════════════════════════════════════════════════

-- 계약 헤더 (목록에 뜨는 최신 스냅샷은 contract_history 최신행으로 산출)
CREATE TABLE IF NOT EXISTS contracts (
  id            TEXT PRIMARY KEY,
  contractor_id TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 계약 이력: 각 상태 이벤트(신규/증액/양수/양도/해지/폐기) 시점의 전체 값 스냅샷
CREATE TABLE IF NOT EXISTS contract_history (
  id                       BIGSERIAL PRIMARY KEY,
  contract_id              TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  status                   TEXT NOT NULL,          -- 신규/증액/양수/양도/해지/폐기
  event_date               DATE,
  org                      TEXT,                   -- 소속 (A/B, 시스템관리에서 추가)
  business_unit            TEXT,                   -- 사업부 (매출관리와 별개 필드, 시스템관리에서 추가)
  contractor_name          TEXT,                   -- 계약자
  contract_no              TEXT,                   -- 계약번호 (PK 아님, 사용자 자유입력 참조번호)
  contract_type            TEXT,                   -- 계약구분 (LAS매장점주/직원/LAS-On파트장/LAS-On파트너)
  parent_contract_id       TEXT REFERENCES contracts(id), -- 소속 파트장 계약 (LAS-On파트너 전용, 라스온 현황 연결 키)
  contract_date            DATE,                   -- 계약일
  deposit                  BIGINT DEFAULT 0,       -- 보증금
  allowance                BIGINT DEFAULT 0,       -- 수당
  allowance_pay_day        INT,                    -- 수당지급일 (매월 1~31일, 날짜 아님)
  first_allowance_pay_date DATE,                   -- 수당지급기준일
  contract_end_date        DATE,                   -- 계약종료일
  branch                   TEXT,                   -- 지점명
  manager                  TEXT,                   -- 관리자
  recruiter                TEXT,                   -- 유치자
  bank_name                TEXT,                   -- 은행명
  account_no               TEXT,                   -- 계좌번호
  account_owner            TEXT,                   -- 예금주
  resident_no              TEXT,                   -- 주민등록번호
  phone                    TEXT,                   -- 전화번호
  payment_method           TEXT,                   -- 카드/현금
  payment_total            BIGINT DEFAULT 0,
  memo                     TEXT,
  is_draft                 BOOLEAN NOT NULL DEFAULT FALSE, -- 임시저장 여부 (계약등록 확정 전)
  recipient_name           TEXT,                   -- LAS-On 수당 수령인 (계약자와 별개, LAS-On파트장/파트너 전용)
  recipient_bank_name      TEXT,                   -- 수령인 은행명
  recipient_account_no     TEXT,                   -- 수령인 계좌번호
  recipient_account_owner  TEXT,                   -- 수령인 예금주
  recipient_resident_no    TEXT,                   -- 수령인 주민등록번호
  linked_contract_id       TEXT REFERENCES contracts(id), -- 양수·양도 상대방 계약 id (양수 이력엔 양도인, 양도 이력엔 양수인)
  transfer_amount          BIGINT DEFAULT 0,       -- 이 건에서 실제 양수·양도된 금액 (일부양도 지원, 기본은 전액)
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_history_contract ON contract_history(contract_id);
CREATE INDEX IF NOT EXISTS idx_history_date ON contract_history(contract_date);
-- 소득구분 — 수익금(수당) 지급 시 근로소득/사업소득 분리 기준.
-- 4대보험 가입은 시점이 있는 사건이라 계약 단위가 아니라 이력(스냅샷) 단위로 남긴다.
-- 계약 단위로 두면 오늘 값을 바꿀 때 이미 지급한 과거 건까지 소급 변경되어 보인다.
ALTER TABLE contract_history ADD COLUMN IF NOT EXISTS income_type TEXT NOT NULL DEFAULT '사업소득';

-- 결재 분할 (카드 분할결제 / 현금 분할입금, 각 최대 6회)
CREATE TABLE IF NOT EXISTS payment_installments (
  id               BIGSERIAL PRIMARY KEY,
  history_id       BIGINT NOT NULL REFERENCES contract_history(id) ON DELETE CASCADE,
  method           TEXT NOT NULL,      -- 카드/현금
  seq              INT NOT NULL,       -- 회차 1~6
  amount           BIGINT DEFAULT 0,
  -- 카드 필드
  issuer           TEXT,
  card_number      TEXT,
  approval_no      TEXT,
  terminal_no      TEXT,
  serial_no        TEXT,
  transaction_date DATE,
  -- 현금 필드
  identifier_type  TEXT,
  identifier_no    TEXT,
  merchant_name    TEXT,
  merchant_biz_no  TEXT,
  bank             TEXT,
  depositor        TEXT,
  -- 전표/입금증 이미지 Drive 링크
  drive_file_id    TEXT,
  drive_view_url   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_installment_history ON payment_installments(history_id);

-- 계약 문서 (계약서/카드전표/현금입금증 PDF·이미지 → Google Drive 링크만 저장)
CREATE TABLE IF NOT EXISTS contract_documents (
  id             BIGSERIAL PRIMARY KEY,
  contract_id    TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  history_id     BIGINT REFERENCES contract_history(id) ON DELETE SET NULL,
  kind           TEXT,                 -- 계약서/카드전표/현금입금증
  file_name      TEXT,
  drive_file_id  TEXT,
  drive_view_url TEXT,
  reason         TEXT,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doc_contract ON contract_documents(contract_id);

-- ══════════════════════════════════════════════════════════════
-- 조직관리(임용계약) 스키마
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS appointments (
  id                 TEXT PRIMARY KEY,
  contract_no        TEXT,                 -- 계약번호 (LASE-yyyymmdd-000)
  name               TEXT NOT NULL,        -- 계약자명
  type_name          TEXT,                 -- 계약종류(계약명)
  ref                TEXT,                 -- 추천인/추천점
  resident_no        TEXT,                 -- 주민번호
  phone              TEXT,                 -- 연락처
  position           TEXT,                 -- 직급
  salary             BIGINT DEFAULT 0,     -- 급여(연봉)
  activity            BIGINT DEFAULT 0,     -- 활동비
  insurance_type     TEXT,                 -- 사업소득/4대보험
  contract_date      DATE,                 -- 계약일
  payout_date        DATE,                 -- 급여일
  work_start_date    DATE,                 -- 업무개시일
  report_start_date  DATE,                 -- 신고개시일
  end_date           DATE,                 -- 계약종료일
  bank_name          TEXT,                 -- 은행/기관
  account_no         TEXT,                 -- 계좌번호
  account_owner      TEXT,                 -- 예금주
  status             TEXT NOT NULL DEFAULT '정상운영', -- 계약상태
  memo               TEXT,                 -- 비고
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 기존 테이블에도 비고 컬럼을 보강한다 (CREATE TABLE IF NOT EXISTS 는 컬럼을 추가하지 않는다)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS memo TEXT;
CREATE INDEX IF NOT EXISTS idx_appointment_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointment_payout ON appointments(payout_date);

-- 임용계약 변경 이력 (필드 단위 변경 기록)
CREATE TABLE IF NOT EXISTS appointment_history (
  id             BIGSERIAL PRIMARY KEY,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  edited_at      DATE,
  memo           TEXT,
  changes        JSONB,                -- [{label, before, after}, ...]
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appt_history_appt ON appointment_history(appointment_id);

-- 임용계약 제출서류 (등본/신분증/통장 등 → Google Drive 링크만 저장)
CREATE TABLE IF NOT EXISTS appointment_documents (
  id             BIGSERIAL PRIMARY KEY,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  doc_type       TEXT,                 -- 서류종류 (예: 주민등록등본)
  file_name      TEXT,
  drive_file_id  TEXT,
  drive_view_url TEXT,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appt_doc_appt ON appointment_documents(appointment_id);

-- ══════════════════════════════════════════════════════════════
-- 매출관리 스키마
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sales (
  id               TEXT PRIMARY KEY,
  date             DATE,                 -- 매출일
  category         TEXT,                 -- 매출구분 (시스템관리 salesCategories)
  org              TEXT,                 -- 소속 (A/B, 계약관리와 동일 코드셋)
  business_unit    TEXT,                 -- 사업부
  buyer            TEXT,                 -- 구매자
  manager          TEXT,                 -- 담당(지점/담당자)
  inputter_org     TEXT,                 -- 입력자 소속
  inputter_name    TEXT,                 -- 입력자 성명
  payment_method   TEXT,                 -- 카드/현금/혼합/없음
  payment_total    BIGINT DEFAULT 0,
  verified         BOOLEAN NOT NULL DEFAULT false, -- 전표 검증 여부
  memo             TEXT,
  source           TEXT NOT NULL DEFAULT 'sale',   -- sale(직접등록) / contract(계약 보증금 연동) / textbook(교재신청 연동)
  contract_id      TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);

-- 매출 결재 분할 (카드/현금, contract_history의 payment_installments와 동일 구조)
CREATE TABLE IF NOT EXISTS sales_installments (
  id               BIGSERIAL PRIMARY KEY,
  sale_id          TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method           TEXT NOT NULL,      -- 카드/현금
  seq              INT NOT NULL,
  amount           BIGINT DEFAULT 0,
  issuer           TEXT,
  card_number      TEXT,
  approval_no      TEXT,
  terminal_no      TEXT,
  serial_no        TEXT,
  transaction_date DATE,
  identifier_type  TEXT,
  identifier_no    TEXT,
  merchant_name    TEXT,
  merchant_biz_no  TEXT,
  bank             TEXT,
  depositor        TEXT,
  drive_file_id    TEXT,
  drive_view_url   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_installment_sale ON sales_installments(sale_id);

-- 매출 첨부서류 (전표/입금증 → Google Drive 링크만 저장)
CREATE TABLE IF NOT EXISTS sales_documents (
  id             BIGSERIAL PRIMARY KEY,
  sale_id        TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  kind           TEXT,
  file_name      TEXT,
  drive_file_id  TEXT,
  drive_view_url TEXT,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_doc_sale ON sales_documents(sale_id);

-- ══════════════════════════════════════════════════════════════
-- 지급관리 · 추가지급 대상자 (수익금지급 화면에서 수동 등록)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS extra_payouts (
  id             TEXT PRIMARY KEY,
  source         TEXT NOT NULL,        -- 조직관리 / 계약자
  name           TEXT NOT NULL,
  memo           TEXT,                 -- 지급내역
  amount         BIGINT NOT NULL DEFAULT 0,
  resident_no    TEXT,
  bank_name      TEXT,
  account_no     TEXT,
  account_owner  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════
-- 시스템 설정 (key-value) — 일일보고 수신 이메일 등, 백엔드(cron)에서도 참조 필요한 설정
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- ══════════════════════════════════════════════════════════════
-- 교재구매 신청 관리 (교재구입 정보만 — 결제/입금은 매출관리에서 별도 처리)
--   · 수기 신청서 사진 원본 / 양식 기반 생성 PDF → Google Drive, 여기엔 링크만 저장
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS textbook_applications (
  id                    TEXT PRIMARY KEY,
  apply_date            DATE,
  buyer_name            TEXT NOT NULL,
  child_name            TEXT,
  child_birthdate       TEXT,
  phone                 TEXT,
  address               TEXT,
  delivery_memo         TEXT,
  book1_name            TEXT,
  book2_name            TEXT,
  subscription_type     TEXT,
  management_type       TEXT,
  seller_name           TEXT,
  seller_phone          TEXT,
  drive_photo_file_id   TEXT,
  drive_photo_view_url  TEXT,
  drive_pdf_file_id     TEXT,
  drive_pdf_view_url    TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_textbook_app_date ON textbook_applications(apply_date);

-- 매출 원천에 textbook 추가: 신청 접수 시 결제정보가 있으면 sales에 source='textbook'로 자동 연결
ALTER TABLE sales ADD COLUMN IF NOT EXISTS textbook_application_id TEXT
  REFERENCES textbook_applications(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_textbook_app ON sales(textbook_application_id);

-- ══════════════════════════════════════════════════════════════
-- LAS-ON 매장선정관리 (섭외 매장 마스터 + 접촉이력) — LAS-On_Store_Manager.md 요구사항서 Phase 1
--   · 사진 원본 → Google Drive, 여기엔 링크만 저장
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS store_master (
  id                     TEXT PRIMARY KEY,
  business_reg_no        TEXT,                   -- 사업자등록번호 (단계적 필수)
  store_phone            TEXT,                   -- 매장 전화번호 (하이픈 제거 정규화)
  road_address           TEXT,
  detail_address         TEXT,
  lat                    DOUBLE PRECISION,
  lng                    DOUBLE PRECISION,
  store_name             TEXT NOT NULL,
  business_type          TEXT,                   -- 업종/업태
  total_area             TEXT,
  available_area         TEXT,
  floor_location         TEXT,
  business_hours         TEXT,
  commercial_note        TEXT,
  chain_brand            TEXT,                   -- 소속 체인/브랜드
  contact_name           TEXT,
  contact_position       TEXT,                   -- 점주/점장/본사담당
  contact_mobile         TEXT,
  decision_authority     TEXT,                   -- 의사결정권 여부
  progress_status        TEXT,                   -- 실측 진행상태(원본 표기, 예: 실측완료/협의서전, 실측예정)
  ceo_confirm            TEXT,                   -- CEO컨펌 여부(컨펌완료/컨펌전 등)
  survey_date            TEXT,                   -- 실측(예정)일
  status                 TEXT NOT NULL DEFAULT '신규등록', -- 신규등록/접촉중/협의중/계약진행/입점완료/보류/거절
  business_unit          TEXT,                   -- 사업부 (선점 담당자 계정 기준 자동표시, 시스템관리 공통코드 목록에서 선택)
  claimed_part           TEXT,                   -- 선점 파트
  claimed_staff          TEXT,                   -- 선점 담당자
  claimed_at             DATE,
  claim_expires_at       DATE,
  reject_reason          TEXT,
  recontact_available_at DATE,
  memo                   TEXT,
  created_by             TEXT,
  updated_by             TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_master_phone ON store_master(store_phone);
CREATE INDEX IF NOT EXISTS idx_store_master_bizno ON store_master(business_reg_no);
CREATE INDEX IF NOT EXISTS idx_store_master_status ON store_master(status);

-- 섭외 접촉이력 (매장 1 : 이력 N)
CREATE TABLE IF NOT EXISTS store_recruitment_log (
  id             BIGSERIAL PRIMARY KEY,
  store_id       TEXT NOT NULL REFERENCES store_master(id) ON DELETE CASCADE,
  part           TEXT,
  staff          TEXT,
  contact_date   DATE,
  contact_method TEXT,                            -- 방문/전화/기타
  result         TEXT,                            -- 관심/보류/거절
  next_action    TEXT,
  memo           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_log_store ON store_recruitment_log(store_id);

-- 매장 사진 (외관/내부, Google Drive 링크)
CREATE TABLE IF NOT EXISTS store_photos (
  id             BIGSERIAL PRIMARY KEY,
  store_id       TEXT NOT NULL REFERENCES store_master(id) ON DELETE CASCADE,
  drive_file_id  TEXT NOT NULL,
  drive_view_url TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT '건물외관',   -- 건물외관/라스온설치공간/겨냥도/완성이미지
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_photos_store ON store_photos(store_id);
ALTER TABLE store_photos ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT '건물외관';

-- 파트너 계정(현장 파트장/파트너) — Firebase Auth 이메일/비밀번호 계정 + 역할·소속 정보
-- 파트너 가입 요청 (본인 제출 → 관리자 승인/거절)
CREATE TABLE IF NOT EXISTS staff_requests (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT NOT NULL,
  business_unit TEXT,                                  -- 사업부 (시스템관리 공통코드 목록에서 선택)
  role          TEXT NOT NULL DEFAULT 'field_partner',
  part          TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',       -- pending / approved / rejected
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS staff_accounts (
  id          TEXT PRIMARY KEY,          -- Firebase Auth UID
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT NOT NULL,
  business_unit TEXT,                    -- 사업부 (시스템관리 공통코드 목록에서 선택)
  role        TEXT NOT NULL DEFAULT 'field_partner', -- field_partner / part_leader
  part        TEXT,                      -- 소속 파트(파트장명)
  status      TEXT NOT NULL DEFAULT 'active',        -- active / inactive
  can_register_store BOOLEAN NOT NULL DEFAULT FALSE,  -- 매장섭외관리 신규 매장 등록 권한(본부 담당자 지정용)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 시스템관리 공통코드 (소속/계약구분/상태/사업부/임용상태) — 로그인 없는 공개 페이지(파트너 가입요청)에서도
-- 읽을 수 있어야 해서 브라우저 localStorage가 아니라 서버 DB에 둔다.
CREATE TABLE IF NOT EXISTS system_codes (
  id         BIGSERIAL PRIMARY KEY,
  kind       TEXT NOT NULL,  -- orgs / contractTypes / statuses / businessUnits / appointmentStatuses
  value      TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,  -- 표시 순서 (관리자가 위/아래로 이동 가능)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);

-- 다중 역할 — 조직 축이 다르면 한 사람이 여러 역할을 겸할 수 있다(예: LAS-On파트너이면서 매장 점주).
--   섭외축: part_leader > field_partner (축 내부 배타)
--   운영축: store_owner / store_manager (축 내부 배타)
--   관리축: admin
-- 인가 판정은 roles 기준이며, 권한은 보유 역할 권한의 합집합이다.
-- 기존 role 컬럼은 주 역할 표시용으로 유지한다(하위호환).
ALTER TABLE staff_accounts ADD COLUMN IF NOT EXISTS roles TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE staff_accounts ADD COLUMN IF NOT EXISTS las_code      TEXT;  -- las-mgmt referral_code (LAS1000~2999)
ALTER TABLE staff_accounts ADD COLUMN IF NOT EXISTS branch        TEXT;  -- 지점(배송 조회 범위 제한용)
ALTER TABLE staff_accounts ADD COLUMN IF NOT EXISTS business_unit TEXT;  -- 사업부(점주/점장)

-- 가입 요청 — 섭외 조직(파트너/파트장)과 매장 운영(점주/점장)은 별도 운영이라 폼이 나뉘고,
-- 어느 축의 요청인지는 role 값으로 구분된다. 사업부·지점은 점주/점장 요청에서만 채워진다.
ALTER TABLE staff_requests ADD COLUMN IF NOT EXISTS business_unit TEXT;
ALTER TABLE staff_requests ADD COLUMN IF NOT EXISTS branch        TEXT;
CREATE INDEX IF NOT EXISTS idx_staff_roles    ON staff_accounts USING GIN(roles);
CREATE INDEX IF NOT EXISTS idx_staff_las_code ON staff_accounts(las_code);
CREATE INDEX IF NOT EXISTS idx_staff_email    ON staff_accounts(email);
-- 기존 데이터 이관 (멱등: roles가 비어있는 행만)
UPDATE staff_accounts SET roles = ARRAY[role] WHERE roles = '{}' OR roles IS NULL;

-- ══════════════════════════════════════════════════════════════
-- 배송관리 (교재구매 신청 → 배송 라이프사이클)
--   · 신청 1건당 배송 1건 자동 생성. 배송지/교재는 신청 시점 스냅샷.
--   · 접수 ≠ 배송: 신청 시점에 배송지가 확정되지 않을 수 있어(현장의 "추후배송" 조건)
--     배송지가 없으면 '추후배송'으로 시작하고 배송목록 전송 대상에서 제외한다.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS shipments (
  id                      TEXT PRIMARY KEY,                 -- S0001 (MAX+1)
  textbook_application_id TEXT REFERENCES textbook_applications(id) ON DELETE SET NULL,
  -- 배송지 스냅샷 (신청 시점 복사, 배송건에서 수정 가능 — 신청 원본과 분리한다)
  recipient_name          TEXT,
  phone                   TEXT,
  address                 TEXT,
  delivery_memo           TEXT,
  book1_name              TEXT,
  book2_name              TEXT,
  -- 상태 / 추적
  status                  TEXT NOT NULL DEFAULT '접수',      -- 접수/추후배송/목록확정/전송완료/배송중/배송완료/완료확인/취소
  carrier                 TEXT,                             -- 택배사
  tracking_no             TEXT,                             -- 송장번호
  batch_id                TEXT,                             -- 목록 전송 배치 식별(한 번에 보낸 묶음)
  sent_to_logistics_at    TIMESTAMPTZ,                      -- 물류업체 전송 시각
  shipped_at              TIMESTAMPTZ,                      -- 발송(송장등록) 시각
  delivered_at            TIMESTAMPTZ,                      -- 배송완료 시각
  confirmed_at            TIMESTAMPTZ,                      -- 완료확인 시각
  memo                    TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_app    ON shipments(textbook_application_id);
CREATE INDEX IF NOT EXISTS idx_shipments_batch  ON shipments(batch_id);

-- 상태 전이 이력 — 모든 전이를 actor/memo 와 함께 남긴다(물리 삭제 대신 '취소' 상태로 관리)
CREATE TABLE IF NOT EXISTS shipment_log (
  id           BIGSERIAL PRIMARY KEY,
  shipment_id  TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  from_status  TEXT,
  to_status    TEXT,
  actor        TEXT,                                       -- 처리자(이메일/이름)
  memo         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipment_log_shipment ON shipment_log(shipment_id);

-- ══════════════════════════════════════════════════════════════
-- 교재신청 소유권 — 신청자 본인/지점 범위 조회용
--   · seller_name 은 표시용 이름 칸이라 소유권 판정에 쓸 수 없다(현재 이메일이 들어가 있다).
--   · 지점은 신청 시점 값을 박아둔다. 점주가 나중에 지점을 옮겨도
--     "그때 그 지점 점장"이 계속 조회할 수 있어야 하기 때문이다.
-- ══════════════════════════════════════════════════════════════
ALTER TABLE textbook_applications ADD COLUMN IF NOT EXISTS created_by_email  TEXT;
ALTER TABLE textbook_applications ADD COLUMN IF NOT EXISTS created_by_branch TEXT;
CREATE INDEX IF NOT EXISTS idx_textbook_creator ON textbook_applications(created_by_email);
CREATE INDEX IF NOT EXISTS idx_textbook_branch  ON textbook_applications(created_by_branch);

-- 기존 데이터 보정 (멱등) — seller_name 에 이메일이 저장돼 온 건들을 소유자 키로 옮긴다
UPDATE textbook_applications
   SET created_by_email = seller_name
 WHERE created_by_email IS NULL
   AND seller_name LIKE '%@%';

-- ══════════════════════════════════════════════════════════════
-- 배송추적 (스마트택배 조회 API 연동)
--   · 접수·송장발급은 수동이고, 송장번호가 등록된 뒤의 "조회"만 자동화한다.
--   · 추적 수단은 서비스 계층에서 교체 가능하게 두고, 여기엔 결과만 남긴다.
-- ══════════════════════════════════════════════════════════════
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS tracking_provider    TEXT;        -- manual / sweettracker
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS tracking_status_text TEXT;        -- 택배사 원문 상태(예: 배달완료)
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS last_tracked_at      TIMESTAMPTZ; -- 마지막 조회 시각
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS tracking_raw         JSONB;       -- 원본 응답(문제 추적용)
CREATE INDEX IF NOT EXISTS idx_shipments_tracking ON shipments(status, last_tracked_at);

-- ══════════════════════════════════════════════════════════════
-- 점주 온보딩 시도 기록 — LAS 고유번호 무차별 대입 차단용
--   · Cloud Run 인스턴스가 여러 개라 메모리 카운터로는 제한이 새므로 DB 에 남긴다.
--   · 개인정보는 담지 않는다(고유번호·IP·성공여부만).
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS owner_verify_attempts (
  id            BIGSERIAL PRIMARY KEY,
  ip            TEXT,
  referral_code TEXT,
  ok            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_owner_attempt_time ON owner_verify_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_owner_attempt_ip   ON owner_verify_attempts(ip, created_at);
CREATE INDEX IF NOT EXISTS idx_owner_attempt_code ON owner_verify_attempts(referral_code, created_at);

-- ══════════════════════════════════════════════════════════════
-- 구독 정기발송 (구독·관리회원 — 상품 K2~K7 / S2~S7, 2주 간격 1년)
--   · 신청 시 1년치를 한 번에 결제하므로 매출은 1건뿐이다(회차별 결제 아님).
--   · 26회차를 미리 만들지 않는다. 하루 20건이면 520행이 한 번에 쌓여 대장을 못 쓴다.
--     회차가 도래할 때 크론이 한 건씩 만든다.
-- ══════════════════════════════════════════════════════════════
ALTER TABLE textbook_applications ADD COLUMN IF NOT EXISTS ship_product      TEXT;    -- 구독 상품(K2~S7)
ALTER TABLE textbook_applications ADD COLUMN IF NOT EXISTS ship_interval_days INT;    -- 발송 간격(기본 14)
ALTER TABLE textbook_applications ADD COLUMN IF NOT EXISTS ship_total        INT;     -- 총 회차(1년 = 26)
ALTER TABLE textbook_applications ADD COLUMN IF NOT EXISTS ship_seq          INT NOT NULL DEFAULT 0; -- 발송 완료 회차
ALTER TABLE textbook_applications ADD COLUMN IF NOT EXISTS ship_next_date    DATE;    -- 다음 발송예정일
ALTER TABLE textbook_applications ADD COLUMN IF NOT EXISTS ship_paused       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE textbook_applications ADD COLUMN IF NOT EXISTS ship_canceled_at  TIMESTAMPTZ; -- 해지 시각(설정되면 더 만들지 않는다)
CREATE INDEX IF NOT EXISTS idx_textbook_ship_next ON textbook_applications(ship_next_date)
  WHERE ship_next_date IS NOT NULL;

-- 회차 번호 — 크론이 두 번 돌거나 인스턴스가 둘이어도 같은 회차가 두 번 생기면 안 된다.
-- 애플리케이션 로직이 아니라 DB 제약으로 막는다.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS ship_seq INT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_shipment_app_seq
  ON shipments(textbook_application_id, ship_seq)
  WHERE textbook_application_id IS NOT NULL AND ship_seq IS NOT NULL;
