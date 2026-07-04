// OCR / 정보추출 서비스 (독립 시스템)
// 레퍼런스: lavenmanager ocrService.js (Gemini 2.5 Flash 멀티모달)
// 카드전표(type='sales') / 현금영수증(type='cash_receipt') 이미지 → 구조화 필드 추출

const { GoogleGenerativeAI } = require('@google/generative-ai')

const apiKey = process.env.GEMINI_API_KEY
let model = null
if (apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey)
  model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
} else {
  console.warn('[ocr] GEMINI_API_KEY 미설정 — OCR은 빈 결과를 반환합니다.')
}

const PROMPTS = {
  // 카드 매출전표
  sales: `이 이미지는 한국 신용카드 매출전표입니다. 아래 필드를 JSON으로만 추출하세요.
값이 없으면 빈 문자열("")로. 금액은 숫자만.
{
  "amount": "금액(숫자만)",
  "issuer": "카드사",
  "approvalNo": "승인번호",
  "terminalNo": "단말기번호(TID/CATID)",
  "serialNo": "일련번호(S/N)",
  "cardNumber": "카드번호(보이는 그대로, 마스킹 포함)",
  "transactionDate": "거래일(YYYY-MM-DD)"
}`,
  // 현금영수증 / 입금증
  cash_receipt: `이 이미지는 한국 현금영수증 또는 입금증입니다. 아래 필드를 JSON으로만 추출하세요.
값이 없으면 빈 문자열("")로. 금액은 숫자만.
{
  "amount": "금액(숫자만)",
  "approvalNo": "승인번호",
  "transactionDate": "거래일(YYYY-MM-DD HH:mm:ss)",
  "identifierType": "식별수단(휴대폰/사업자번호/현금영수증카드)",
  "identifierNo": "식별번호",
  "merchantName": "가맹점명",
  "merchantBizNo": "가맹점 사업자번호"
}`,
}

/** 이미지 버퍼 → OCR 추출 객체. Gemini 미설정 시 {} */
async function analyzeImage(imageBuffer, type = 'sales') {
  if (!model) return {}
  const prompt = PROMPTS[type] || PROMPTS.sales
  const base64 = imageBuffer.toString('base64')
  const result = await model.generateContent([
    prompt,
    { inlineData: { data: base64, mimeType: 'image/jpeg' } },
  ])
  const text = result.response.text()
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return {}
  try {
    return JSON.parse(match[0])
  } catch {
    return {}
  }
}

module.exports = { analyzeImage }
