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
  contractor_name          TEXT,                   -- 계약자
  contract_type            TEXT,                   -- 계약구분 (LAS매장점주/직원/LAS-On파트장/LAS-On파트너)
  contract_date            DATE,                   -- 계약일
  deposit                  BIGINT DEFAULT 0,       -- 보증금
  allowance                BIGINT DEFAULT 0,       -- 수당
  allowance_pay_day        INT,                    -- 수당지급일 (매월 1~31일, 날짜 아님)
  first_allowance_pay_date DATE,                   -- 최초수당지급일
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
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_history_contract ON contract_history(contract_id);
CREATE INDEX IF NOT EXISTS idx_history_date ON contract_history(contract_date);

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
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
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
  business_unit    TEXT,                 -- 사업부
  buyer            TEXT,                 -- 구매자
  manager          TEXT,                 -- 담당(지점/담당자)
  inputter_org     TEXT,                 -- 입력자 소속
  inputter_name    TEXT,                 -- 입력자 성명
  payment_method   TEXT,                 -- 카드/현금/혼합/없음
  payment_total    BIGINT DEFAULT 0,
  verified         BOOLEAN NOT NULL DEFAULT false, -- 전표 검증 여부
  memo             TEXT,
  source           TEXT NOT NULL DEFAULT 'sale',   -- sale(직접등록) / contract(계약 보증금 연동)
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
