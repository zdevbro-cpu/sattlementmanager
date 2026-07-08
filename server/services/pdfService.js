// 교재구매·회원가입 신청서 PDF 생성 (교재구입 정보만 — 결제/입금 항목 없음)
// pdf-lib 기반 A5 신청서 레이아웃
const { PDFDocument, rgb } = require('pdf-lib')
const fs = require('fs')
const path = require('path')
const fontkit = require('@pdf-lib/fontkit')

// A5 portrait 페이지 규격 (148mm × 210mm)
const A5_W = 419.53
const A5_H = 595.28

/**
 * 한글 TTF 폰트 탐색 후 pdf-lib에 임베드.
 * Cloud Run 등 컨테이너 환경엔 한글 폰트가 설치되어 있지 않아(Helvetica 폴백 시 한글 인코딩 자체가
 * 불가능해 PDF 생성이 실패한다), server/fonts/에 폰트 파일을 직접 번들해 최우선으로 사용한다.
 */
async function loadKoreanFont(pdfDoc) {
  const candidates = [
    path.join(__dirname, '..', 'fonts', 'NanumGothicBold.ttf'),
    'C:\\Windows\\Fonts\\malgunbd.ttf',
    'C:\\Windows\\Fonts\\malgun.ttf',
    '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf',
    '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
    '/usr/share/fonts/truetype/nanum/NanumBarunGothic.ttf',
    '/System/Library/Fonts/AppleSDGothicNeo.ttc',
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        return await pdfDoc.embedFont(fs.readFileSync(p), { subset: false })
      } catch (e) {
        console.warn(`[pdf] 폰트 임베딩 실패 [${p}]: ${e.message}`)
      }
    }
  }
  console.error('[pdf] 한글 폰트를 찾을 수 없어 Helvetica로 폴백 — 한글 출력 실패 가능')
  const { StandardFonts } = require('pdf-lib')
  return pdfDoc.embedFont(StandardFonts.Helvetica)
}

/** 교재구매·회원가입 신청서(A5, 교재구입 정보만) PDF 버퍼 생성 */
async function generateApplicationPdf(data) {
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const font = await loadKoreanFont(pdfDoc)

  const page = pdfDoc.addPage([A5_W, A5_H])
  const { width: W, height: H } = page.getSize()
  const ML = 14
  const MR = W - 14
  const CW = MR - ML

  let y = H - 24

  const title = '교재구매, 회원가입 신청서'
  const titleSize = 14
  const titleW = font.widthOfTextAtSize(title, titleSize)
  page.drawText(title, { x: (W - titleW) / 2, y, size: titleSize, font, color: rgb(0, 0, 0) })
  y -= 14
  const sub = '에이멘에이 주식회사'
  const subW = font.widthOfTextAtSize(sub, 9)
  page.drawText(sub, { x: (W - subW) / 2, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) })
  y -= 20

  const ROW = 17
  const LBL_BG = rgb(0.92, 0.93, 0.96)
  const BD = rgb(0.15, 0.18, 0.22)
  const TXT = rgb(0, 0, 0)

  const cell = (x, top, w, h, opts = {}) => {
    page.drawRectangle({
      x,
      y: top - h,
      width: w,
      height: h,
      color: opts.bg || rgb(1, 1, 1),
      borderColor: BD,
      borderWidth: 0.9,
    })
  }
  const text = (str, x, top, opts = {}) => {
    if (str === undefined || str === null || str === '') return
    const size = opts.size || 9
    const txt = String(str)
    const tw = font.widthOfTextAtSize(txt, size)
    const tx = opts.align === 'right' ? x - tw : opts.align === 'center' ? x - tw / 2 : x
    page.drawText(txt, { x: tx, y: top - 12, size, font, color: opts.color || TXT })
  }

  // ─── 01. 기본 정보 ─────────────────────────
  text('01. 기본 정보 (구매자 및 자녀)', ML, y, { size: 10.5 })
  y -= 16
  const halfW = CW / 2
  const lblW = 66

  cell(ML, y, lblW, ROW, { bg: LBL_BG }); text('신청 날짜', ML + 4, y)
  cell(ML + lblW, y, halfW - lblW, ROW); text(data.applyDate, ML + lblW + 4, y)
  cell(ML + halfW, y, lblW, ROW, { bg: LBL_BG }); text('구매자 성명', ML + halfW + 4, y)
  cell(ML + halfW + lblW, y, halfW - lblW, ROW); text(data.buyerName, ML + halfW + lblW + 4, y)
  y -= ROW

  cell(ML, y, lblW, ROW, { bg: LBL_BG }); text('자녀 성명', ML + 4, y)
  cell(ML + lblW, y, halfW - lblW, ROW); text(data.childName, ML + lblW + 4, y)
  cell(ML + halfW, y, lblW, ROW, { bg: LBL_BG }); text('자녀생년월일', ML + halfW + 4, y)
  cell(ML + halfW + lblW, y, halfW - lblW, ROW); text(data.childBirthdate, ML + halfW + lblW + 4, y)
  y -= ROW

  cell(ML, y, lblW, ROW, { bg: LBL_BG }); text('전화번호', ML + 4, y)
  cell(ML + lblW, y, CW - lblW, ROW); text(data.phone, ML + lblW + 4, y)
  y -= ROW

  cell(ML, y, lblW, ROW, { bg: LBL_BG }); text('배송지', ML + 4, y)
  cell(ML + lblW, y, CW - lblW, ROW); text(data.address, ML + lblW + 4, y)
  y -= ROW

  cell(ML, y, lblW, ROW, { bg: LBL_BG }); text('배송메모', ML + 4, y)
  cell(ML + lblW, y, CW - lblW, ROW); text(data.deliveryMemo, ML + lblW + 4, y)
  y -= ROW + 10

  // ─── 02. 교재 구입 및 회원 구독 신청 ───────
  text('02. 교재 구입 및 회원 구독 신청', ML, y, { size: 10.5 })
  y -= 16
  const catLblW = 90

  cell(ML, y, catLblW, ROW, { bg: LBL_BG }); text('교재구입 1', ML + 4, y)
  cell(ML + catLblW, y, CW - catLblW, ROW); text(data.book1Name, ML + catLblW + 4, y)
  y -= ROW

  cell(ML, y, catLblW, ROW, { bg: LBL_BG }); text('교재구입 2', ML + 4, y)
  cell(ML + catLblW, y, CW - catLblW, ROW); text(data.book2Name, ML + catLblW + 4, y)
  y -= ROW

  cell(ML, y, catLblW, ROW, { bg: LBL_BG }); text('구독회원 구분', ML + 4, y)
  cell(ML + catLblW, y, CW - catLblW, ROW); text(data.subscriptionType, ML + catLblW + 4, y)
  y -= ROW

  cell(ML, y, catLblW, ROW, { bg: LBL_BG }); text('관리회원 구분', ML + 4, y)
  cell(ML + catLblW, y, CW - catLblW, ROW); text(data.managementType, ML + catLblW + 4, y)
  y -= ROW + 14

  const CX = W / 2

  // ─── 담당자 ─────────────────────────────────
  const sellerLblW = 100
  const hpLblW = 30
  const hpValW = 110
  const sellerValW = CW - sellerLblW - hpLblW - hpValW
  cell(ML, y, sellerLblW, ROW, { bg: LBL_BG }); text('담당자 소속·성명', ML + 4, y)
  cell(ML + sellerLblW, y, sellerValW, ROW); text(data.sellerName, ML + sellerLblW + 4, y)
  cell(ML + sellerLblW + sellerValW, y, hpLblW, ROW, { bg: LBL_BG }); text('H.P', ML + sellerLblW + sellerValW + 4, y, { size: 8 })
  cell(ML + sellerLblW + sellerValW + hpLblW, y, hpValW, ROW); text(data.sellerPhone, ML + sellerLblW + sellerValW + hpLblW + 4, y)
  y -= ROW + 16

  // ─── 개인 정보 수집·이용 동의서 ───────────────
  text('개인 정보 수집·이용 동의서', CX, y, { size: 9, align: 'center' })
  y -= 11
  text('교재구입 및 구독회원, 관리회원의 개인정보 수집 및 이용 목적은 다음과 같습니다.', CX, y, { size: 7, color: rgb(0.4, 0.4, 0.4), align: 'center' })
  y -= 9
  text('내용을 자세히 읽어 보신 후 동의 여부를 결정하여 주시기 바랍니다.', CX, y, { size: 7, color: rgb(0.4, 0.4, 0.4), align: 'center' })
  y -= 13

  const tblW = CW * 0.82
  const tblX = ML + (CW - tblW) / 2
  const cWs = [tblW * 0.4, tblW * 0.3, tblW * 0.3]
  let hx = tblX
  ;['수집목적', '항목', '보유 및 이용기간'].forEach((h, i) => {
    cell(hx, y, cWs[i], ROW - 2, { bg: LBL_BG })
    text(h, hx + cWs[i] / 2, y, { align: 'center', size: 7.5 })
    hx += cWs[i]
  })
  y -= ROW - 2
  hx = tblX
  ;['회원식별 및 서비스제공', '이름, 연락처', '수집일로부터 1년'].forEach((v, i) => {
    cell(hx, y, cWs[i], ROW - 2)
    text(v, hx + cWs[i] / 2, y, { align: 'center', size: 7.5 })
    hx += cWs[i]
  })
  y -= ROW - 2 + 2

  text('※ 개인정보 수집·이용을 거부할 권리가 있습니다. 단, 거부 시 서비스가 제한될 수 있습니다.', CX, y, { size: 6.8, color: rgb(0.4, 0.4, 0.4), align: 'center' })
  y -= 10
  text('신청서 제출로 위 개인정보 수집·이용에 동의한 것으로 간주합니다.', CX, y, { size: 7.5, align: 'center' })
  y -= 16

  // ─── 구매철회 / 해지 / 환불 안내 ───────────────
  text('구매철회 / 해지 / 환불', CX, y, { size: 9, align: 'center' })
  y -= 11
  text('1. 구매철회 : 제품 구입 신청 후 배송이전 철회 가능.', CX, y, { size: 7, align: 'center' })
  y -= 9
  text('2. 구매해지 : 물품인도일로 7일이내 미개봉 시 해지가능 (개통 후 단순 변심일 경우 해지 불가함)', CX, y, { size: 7, align: 'center' })
  y -= 9
  text('3. 환    불 : 철회/해지 접수 후 14일이내 반환', CX, y, { size: 7, align: 'center' })
  y -= 16

  // ─── 신청 일자 + 신청인 서명란 ───────────────
  let yy = '', mm = '', dd = ''
  if (data.applyDate) {
    const dm = String(data.applyDate).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (dm) { yy = dm[1].slice(2); mm = dm[2]; dd = dm[3] }
  }
  const dateText = `20  ${yy || '   '}  년    ${mm || '   '}   월    ${dd || '   '}   일`
  text(dateText, CX, y, { size: 10.5, align: 'center' })
  y -= 24

  const sigBoxW = 110
  const sigBoxH = 30
  text('신청인', CX - 150, y, { size: 9.5 })
  text(data.buyerName || '', CX - 110, y, { size: 10.5 })
  text('서명 (', CX + 10, y, { size: 9.5 })
  cell(CX + 40, y + 8, sigBoxW, sigBoxH)
  text(')', CX + 40 + sigBoxW + 4, y, { size: 9.5 })
  y -= sigBoxH + 12

  // ─── 회사 푸터 ───────────────────────────────
  text('에이멘에이 주식회사', CX, y, { size: 11, align: 'center' })
  y -= 12
  text('* 신청서는 당일 사진을 찍어 담당자에게 전달해 주세요.', CX, y, { size: 7.5, color: rgb(0.4, 0.4, 0.4), align: 'center' })

  const bytes = await pdfDoc.save()
  return Buffer.from(bytes)
}

module.exports = { generateApplicationPdf }
