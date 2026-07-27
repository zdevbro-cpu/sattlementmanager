import { useEffect, useState } from 'react'
import { Share, Smartphone, X } from 'lucide-react'

/**
 * 홈 화면에 추가 안내.
 *
 * 파트너는 IT 환경이 열악해 브라우저 메뉴에서 '홈 화면에 추가'를 찾는 것 자체가 장벽이다.
 * 한 번만 넘기면 그 뒤로는 아이콘만 눌러 들어오므로, 이 단계를 화면에서 직접 유도한다.
 *
 * 안드로이드는 브라우저가 beforeinstallprompt 를 주므로 버튼 한 번으로 설치된다.
 * 아이폰은 이 이벤트가 없고 자동 설치도 불가능해서, 공유 버튼 위치를 그림처럼 설명해 준다.
 *
 * 이미 홈 화면에서 실행 중이면(standalone) 아무것도 보이지 않는다.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'installPromptDismissed'

/** 홈 화면에서 실행 중인지 — 이 경우 안내가 필요 없다 */
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS 사파리는 표준 API 대신 navigator.standalone 을 쓴다
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosGuide, setShowIosGuide] = useState(false)
  const [hidden, setHidden] = useState(
    () => isStandalone() || localStorage.getItem(DISMISS_KEY) === '1',
  )

  useEffect(() => {
    if (hidden) return
    const onPrompt = (e: Event) => {
      // 브라우저 기본 안내를 막고 우리 버튼으로 대신 띄운다
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    // 설치가 끝나면 안내를 지운다
    const onInstalled = () => setHidden(true)
    window.addEventListener('appinstalled', onInstalled)
    // 아이폰은 설치 이벤트가 없으므로 안내문을 바로 띄운다
    if (isIos()) setShowIosGuide(true)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [hidden])

  const close = () => {
    // 닫으면 다시 띄우지 않는다 — 매번 뜨면 그 자체가 방해가 된다
    localStorage.setItem(DISMISS_KEY, '1')
    setHidden(true)
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted') setHidden(true)
    setDeferred(null)
  }

  if (hidden) return null
  if (!deferred && !showIosGuide) return null

  return (
    <div className="mb-3 flex items-start gap-2.5 rounded-[12px] border border-primary/40 bg-primary/10 px-3.5 py-3">
      <Smartphone size={18} className="mt-0.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-text-strong">홈 화면에 추가하세요</div>
        {deferred ? (
          <>
            <p className="mt-0.5 text-[12px] leading-[1.5] text-[#94a3b8]">
              한 번만 추가하면 다음부터 아이콘만 눌러 바로 들어옵니다.
            </p>
            <button
              onClick={install}
              className="mt-2 h-9 rounded-[8px] bg-primary px-4 text-[12.5px] font-bold text-white hover:brightness-110"
            >
              홈 화면에 추가
            </button>
          </>
        ) : (
          <p className="mt-0.5 text-[12px] leading-[1.6] text-[#94a3b8]">
            아래쪽 공유 버튼
            <Share size={12} className="mx-1 inline align-[-1px] text-primary" />
            을 누르고 <span className="font-bold text-[#c2cde0]">「홈 화면에 추가」</span>를 선택하세요.
            다음부터 아이콘만 눌러 바로 들어옵니다.
          </p>
        )}
      </div>
      <button
        onClick={close}
        aria-label="닫기"
        className="shrink-0 rounded-[6px] p-1 text-[#64748b] hover:bg-hover"
      >
        <X size={15} />
      </button>
    </div>
  )
}
