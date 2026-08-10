import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function AccountSafety({ session, onDeleted }) {
  const [expanded, setExpanded] = useState(false)
  const [emailConfirm, setEmailConfirm] = useState('')
  const [wordConfirm, setWordConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const email = session?.user?.email || ''
  const canDelete = emailConfirm.trim().toLowerCase() === email.toLowerCase()
    && wordConfirm.trim() === '탈퇴'

  async function deleteAccount(event) {
    event.preventDefault()
    if (!canDelete || busy) return
    if (!window.confirm('계정과 여행 데이터가 영구 삭제됩니다. 정말 탈퇴할까요?')) return

    setBusy(true)
    setMessage('')
    const { error } = await supabase.rpc('delete_own_account')
    if (error) {
      setMessage(`계정을 삭제하지 못했습니다: ${error.message}`)
      setBusy(false)
      return
    }

    await supabase.auth.signOut({ scope: 'local' })
    localStorage.removeItem('travelon-ai-route')
    localStorage.removeItem('travelon-personal-ai-provider')
    onDeleted?.()
  }

  return (
    <section className="account-safety" aria-labelledby="account-safety-title">
      <div className="account-safety__heading">
        <div>
          <p className="section-label">계정과 개인정보</p>
          <h2 id="account-safety-title">내 정보 관리</h2>
        </div>
        <span aria-hidden="true">🛡️</span>
      </div>

      <div className="account-safety__links">
        <a href="/privacy.html" target="_blank" rel="noreferrer">개인정보 처리방침</a>
        <a href="/terms.html" target="_blank" rel="noreferrer">서비스 이용약관</a>
        <a href="/account-deletion.html" target="_blank" rel="noreferrer">계정 삭제 안내</a>
      </div>

      <button className="account-delete-toggle" type="button" onClick={() => setExpanded((value) => !value)}>
        {expanded ? '회원 탈퇴 닫기' : '회원 탈퇴'}
      </button>

      {expanded && (
        <form className="account-delete-form" onSubmit={deleteAccount}>
          <p>탈퇴하면 계정, 여행, 일정, 경비, 사진 및 게시물이 영구 삭제되며 복구할 수 없습니다.</p>
          <label>
            확인을 위해 로그인 이메일 입력
            <input
              type="email"
              value={emailConfirm}
              onChange={(event) => setEmailConfirm(event.target.value)}
              placeholder={email}
              autoComplete="email"
              required
            />
          </label>
          <label>
            아래에 <strong>탈퇴</strong> 입력
            <input
              type="text"
              value={wordConfirm}
              onChange={(event) => setWordConfirm(event.target.value)}
              placeholder="탈퇴"
              required
            />
          </label>
          <button className="danger" type="submit" disabled={!canDelete || busy}>
            {busy ? '삭제하는 중…' : '내 계정과 데이터 영구 삭제'}
          </button>
        </form>
      )}

      {message && <p className="auth-message" role="status">{message}</p>}
    </section>
  )
}
