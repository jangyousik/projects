import { useState } from 'react'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { getAuthRedirectUrl } from '../lib/mobileAuth'

export function AuthPanel({ session, onClose }) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const sendMagicLink = async (event) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: getAuthRedirectUrl() },
    })
    setMessage(error ? error.message : '로그인 링크를 이메일로 보냈습니다.')
    setLoading(false)
  }

  const signInWithGoogle = async () => {
    setLoading(true)
    setMessage('')
    const isNative = Capacitor.isNativePlatform()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getAuthRedirectUrl(),
        skipBrowserRedirect: isNative,
        queryParams: { prompt: 'select_account' },
      },
    })

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    if (isNative && data?.url) {
      await Browser.open({ url: data.url })
    }
    setLoading(false)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    onClose()
  }

  if (!isSupabaseConfigured) {
    return <p className="auth-notice">Supabase 연결 정보가 없어 로그인 기능을 사용할 수 없습니다.</p>
  }

  if (session) {
    return (
      <div className="auth-account">
        <strong>{session.user.user_metadata?.name || session.user.email}</strong>
        <span>{session.user.email}</span>
        <button className="dialog-submit" type="button" onClick={signOut}>로그아웃</button>
      </div>
    )
  }

  return (
    <div className="auth-panel">
      <button className="google-login-button" type="button" onClick={signInWithGoogle} disabled={loading}>
        <span className="google-mark" aria-hidden="true">G</span>
        Google로 계속하기
      </button>
      <div className="auth-divider"><span>또는</span></div>
      <form onSubmit={sendMagicLink}>
        <label>
          이메일
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            placeholder="name@example.com"
          />
        </label>
        <button className="dialog-submit" type="submit" disabled={loading}>
          {loading ? '처리 중…' : '이메일 로그인 링크 받기'}
        </button>
      </form>
      {message && <p className="auth-message" role="status">{message}</p>}
    </div>
  )
}
