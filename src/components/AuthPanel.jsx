import { useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

export function AuthPanel({ session, onClose }) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const sendMagicLink = async (event) => {
    event.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setMessage(error ? error.message : '로그인 링크를 이메일로 보냈습니다.')
    setLoading(false)
  }

  const signInWithGoogle = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) setMessage(error.message)
    setLoading(false)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    onClose()
  }

  if (!isSupabaseConfigured) {
    return <p className="auth-notice">Supabase 프로젝트 연결 후 로그인이 활성화됩니다. 현재는 오프라인 모드입니다.</p>
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
      <button className="google-login" type="button" onClick={signInWithGoogle} disabled={loading}>Google로 계속하기</button>
      <div className="auth-divider"><span>또는</span></div>
      <form onSubmit={sendMagicLink}>
        <label>이메일<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="name@example.com" /></label>
        <button className="dialog-submit" type="submit" disabled={loading}>{loading ? '연결 중…' : '이메일 로그인 링크 받기'}</button>
      </form>
      {message && <p className="auth-message" role="status">{message}</p>}
    </div>
  )
}
