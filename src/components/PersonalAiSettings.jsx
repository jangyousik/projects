import { useEffect, useState } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'

const SecureAi = registerPlugin('SecureAi')

const PROVIDERS = {
  openai: { name: 'OpenAI', placeholder: 'sk-…' },
  gemini: { name: 'Google Gemini', placeholder: 'AIza…' },
}

export function PersonalAiSettings() {
  const [provider, setProvider] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [connected, setConnected] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const native = Capacitor.isNativePlatform()

  useEffect(() => {
    if (!native) return
    SecureAi.hasSecret({ provider })
      .then(({ exists }) => setConnected(Boolean(exists)))
      .catch(() => setMessage('기기의 보안 저장소 상태를 확인하지 못했습니다.'))
  }, [native, provider])

  async function saveKey(event) {
    event.preventDefault()
    if (!native) return
    const value = apiKey.trim()
    if (value.length < 16) {
      setMessage('API 키를 다시 확인해 주세요.')
      return
    }
    setBusy(true)
    try {
      await SecureAi.saveSecret({ provider, secret: value })
      setApiKey('')
      setConnected(true)
      setMessage('개인 키를 Android 보안 저장소에 저장했습니다. 앱 서버로는 전송하지 않습니다.')
    } catch (error) {
      setMessage(`저장하지 못했습니다: ${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function removeKey() {
    setBusy(true)
    try {
      await SecureAi.deleteSecret({ provider })
      setConnected(false)
      setApiKey('')
      setMessage('기기에서 개인 키를 삭제했습니다.')
    } catch (error) {
      setMessage(`삭제하지 못했습니다: ${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="personal-ai-page" aria-labelledby="personal-ai-title">
      <div className="personal-ai-hero">
        <span aria-hidden="true">🔐</span>
        <div><p>내 기기에서만</p><h2 id="personal-ai-title">내 AI 안전하게 연결</h2><small>개인 API 키로 직접 AI 서비스를 이용할 수 있습니다.</small></div>
      </div>

      <div className="security-promise">
        <h3>여행온의 보안 약속</h3>
        <ul>
          <li>API 키를 Supabase·Vercel·여행온 서버로 전송하지 않습니다.</li>
          <li>Android Keystore로 암호화하며 화면이나 로그에 다시 표시하지 않습니다.</li>
          <li>AI에 보낼 내용은 사용자가 실행 버튼을 누른 정보만 사용합니다.</li>
          <li>연결 삭제 시 이 기기에 저장된 키도 즉시 삭제합니다.</li>
        </ul>
      </div>

      {!native ? (
        <div className="ai-web-warning"><strong>웹에서는 개인 키 연결을 지원하지 않습니다.</strong><p>브라우저 저장소는 키를 안전하게 보호할 수 없습니다. Android 앱의 설정 화면에서 연결해 주세요.</p></div>
      ) : (
        <form className="personal-ai-form" onSubmit={saveKey}>
          <label>AI 서비스<select value={provider} onChange={(event) => { setProvider(event.target.value); setMessage('') }}><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option></select></label>
          <div className={`ai-connection-state ${connected ? 'is-connected' : ''}`}><span>{connected ? '✓' : '!'}</span><div><strong>{PROVIDERS[provider].name} {connected ? '연결됨' : '연결 안 됨'}</strong><small>{connected ? '키는 이 기기의 보안 저장소에 있습니다.' : '본인의 API 키와 사용료 정책을 확인해 주세요.'}</small></div></div>
          <label>개인 API 키<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={PROVIDERS[provider].placeholder} autoComplete="off" spellCheck="false" /></label>
          <p className="key-caution">키를 복사한 뒤 다른 사람에게 보여주거나 메신저로 보내지 마세요. AI 회사의 사용 한도와 결제 한도도 직접 설정해 주세요.</p>
          <div className="personal-ai-actions"><button type="submit" disabled={busy || !apiKey.trim()}>{busy ? '처리 중…' : connected ? '키 교체' : '안전하게 연결'}</button>{connected && <button className="danger" type="button" onClick={removeKey} disabled={busy}>연결 삭제</button>}</div>
        </form>
      )}

      {message && <p className="auth-message" role="status">{message}</p>}
      <details className="ai-safety-guide"><summary>사용 전 꼭 읽어 주세요</summary><ol><li>개인 AI 서비스에서 프로젝트 전용 API 키를 만드세요.</li><li>월 사용 한도와 알림을 먼저 설정하세요.</li><li>공용 휴대폰에는 연결하지 마세요.</li><li>휴대폰을 분실했거나 키 노출이 의심되면 AI 서비스에서 키를 즉시 폐기하세요.</li><li>여권번호·카드번호·주민등록번호는 AI 입력에 포함하지 마세요.</li></ol></details>
    </section>
  )
}
