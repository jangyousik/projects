import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const CATEGORY = { tip: '여행 팁', question: '질문', review: '후기', companion: '동행' }

export function CommunityBoard({ session }) {
  const [posts, setPosts] = useState([])
  const [blocked, setBlocked] = useState([])
  const [query, setQuery] = useState('')
  const [writing, setWriting] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState([])
  const isAdmin = session.user.app_metadata?.is_admin === true

  const load = useCallback(async () => {
    setLoading(true)
    const [postResult, blockResult, reportResult] = await Promise.all([
      supabase.from('community_posts').select('id,author_id,author_name,destination,category,title,content,created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('user_blocks').select('blocked_id').eq('blocker_id', session.user.id),
      isAdmin ? supabase.from('community_reports').select('id,post_id,reason,status,created_at,community_posts(title)').eq('status', 'pending').order('created_at') : Promise.resolve({ data: [], error: null }),
    ])
    if (postResult.error || blockResult.error || reportResult.error) setMessage(`게시판을 불러오지 못했습니다: ${(postResult.error || blockResult.error || reportResult.error).message}`)
    else {
      setPosts(postResult.data || [])
      setBlocked((blockResult.data || []).map((row) => row.blocked_id))
      setReports(reportResult.data || [])
    }
    setLoading(false)
  }, [isAdmin, session.user.id])

  useEffect(() => { load() }, [load])

  const visiblePosts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return posts.filter((post) => !blocked.includes(post.author_id) && (!needle || `${post.title} ${post.content} ${post.destination || ''}`.toLowerCase().includes(needle)))
  }, [posts, blocked, query])

  async function savePost(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const { data, error } = await supabase.from('community_posts').insert({
      author_id: session.user.id,
      author_name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || '여행자',
      category: form.get('category'),
      destination: String(form.get('destination') || '').trim() || null,
      title: String(form.get('title') || '').trim(),
      content: String(form.get('content') || '').trim(),
    }).select().single()
    if (error) setMessage(`글을 저장하지 못했습니다: ${error.message}`)
    else { setPosts((current) => [data, ...current]); setWriting(false); setMessage('게시글을 등록했습니다.') }
  }

  async function report(post) {
    const reason = window.prompt('신고 이유를 입력해 주세요. 개인정보·광고·허위 정보 등을 구체적으로 알려주세요.')
    if (!reason?.trim()) return
    const { error } = await supabase.from('community_reports').insert({ post_id: post.id, reporter_id: session.user.id, reason: reason.trim() })
    setMessage(error ? `신고하지 못했습니다: ${error.message}` : '신고를 접수했습니다. 확인 전까지 해당 글을 숨기려면 작성자 차단을 이용해 주세요.')
  }

  async function blockAuthor(post) {
    if (!window.confirm(`${post.author_name}님의 글을 앞으로 숨길까요?`)) return
    const { error } = await supabase.from('user_blocks').upsert({ blocker_id: session.user.id, blocked_id: post.author_id })
    if (error) setMessage(`차단하지 못했습니다: ${error.message}`)
    else { setBlocked((current) => [...new Set([...current, post.author_id])]); setMessage('작성자를 차단했습니다.') }
  }

  async function deletePost(post) {
    if (!window.confirm('이 글을 삭제할까요?')) return
    const { error } = await supabase.from('community_posts').delete().eq('id', post.id)
    if (error) setMessage(`삭제하지 못했습니다: ${error.message}`)
    else setPosts((current) => current.filter((item) => item.id !== post.id))
  }

  async function moderate(report, hide) {
    const postUpdate = hide ? await supabase.from('community_posts').update({ hidden: true }).eq('id', report.post_id) : { error: null }
    const reportUpdate = postUpdate.error ? postUpdate : await supabase.from('community_reports').update({ status: hide ? 'reviewed' : 'dismissed' }).eq('id', report.id)
    if (reportUpdate.error) setMessage(`처리하지 못했습니다: ${reportUpdate.error.message}`)
    else {
      setReports((current) => current.filter((item) => item.id !== report.id))
      if (hide) setPosts((current) => current.filter((post) => post.id !== report.post_id))
      setMessage(hide ? '게시글을 숨기고 신고를 처리했습니다.' : '신고를 기각했습니다.')
    }
  }

  return <section className="community-board">
    <div className="community-toolbar"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="여행지·팁 검색" /><button type="button" onClick={() => setWriting((value) => !value)}>{writing ? '닫기' : '＋ 글쓰기'}</button></div>
    {writing && <form className="community-write" onSubmit={savePost}>
      <div className="form-row"><label>분류<select name="category"><option value="tip">여행 팁</option><option value="question">질문</option><option value="review">후기</option><option value="companion">동행</option></select></label><label>여행지<input name="destination" placeholder="예: 후쿠오카" /></label></div>
      <label>제목<input name="title" minLength="2" maxLength="120" required /></label>
      <label>내용<textarea name="content" minLength="2" maxLength="4000" required placeholder="예약번호, 전화번호 등 개인정보는 적지 마세요." /></label>
      <button className="dialog-submit" type="submit">게시하기</button>
    </form>}
    {message && <p className="auth-message" role="status">{message}</p>}
    {isAdmin && reports.length > 0 && <section className="moderation-panel"><h3>신고 검토 {reports.length}건</h3>{reports.map((report) => <article key={report.id}><strong>{report.community_posts?.title || '삭제된 글'}</strong><p>{report.reason}</p><div><button type="button" onClick={() => moderate(report, false)}>기각</button><button type="button" onClick={() => moderate(report, true)}>글 숨김</button></div></article>)}</section>}
    {loading ? <p className="community-empty">게시글을 불러오는 중…</p> : visiblePosts.length ? <div className="community-list">{visiblePosts.map((post) => <article key={post.id}>
      <div><span>{CATEGORY[post.category] || '여행 이야기'}</span>{post.destination && <small>📍 {post.destination}</small>}</div>
      <h3>{post.title}</h3><p>{post.content}</p>
      <footer><small>{post.author_name} · {new Date(post.created_at).toLocaleDateString('ko-KR')}</small><span>{post.author_id === session.user.id ? <button type="button" onClick={() => deletePost(post)}>삭제</button> : <><button type="button" onClick={() => report(post)}>신고</button><button type="button" onClick={() => blockAuthor(post)}>차단</button></>}</span></footer>
    </article>)}</div> : <p className="community-empty">조건에 맞는 여행 이야기가 없습니다.</p>}
  </section>
}
