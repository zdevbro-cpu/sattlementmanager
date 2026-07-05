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
