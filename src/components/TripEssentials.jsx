import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function TripEssentials({ trip, session, canEdit }) {
  const [items, setItems] = useState([])
  const [documents, setDocuments] = useState([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [checkResult, docResult] = await Promise.all([
      supabase.from('trip_checklist_items').select('id,title,completed,sort_order').eq('trip_id', trip.id).order('sort_order').order('created_at'),
      supabase.from('attachments').select('id,storage_path,kind,created_at,caption').eq('trip_id', trip.id).in('kind', ['document', 'qr']).order('created_at', { ascending: false }),
    ])
    if (checkResult.error || docResult.error) setMessage(`준비물을 불러오지 못했습니다: ${(checkResult.error || docResult.error).message}`)
    else { setItems(checkResult.data || []); setDocuments(docResult.data || []) }
  }, [trip.id])
  useEffect(() => { load() }, [load])

  async function addItem(event) {
    event.preventDefault()
    const title = String(new FormData(event.currentTarget).get('title') || '').trim()
    if (!title) return
    const { data, error } = await supabase.from('trip_checklist_items').insert({ trip_id: trip.id, title, created_by: session.user.id, sort_order: items.length }).select().single()
    if (error) setMessage(error.message)
    else { setItems((current) => [...current, data]); event.currentTarget.reset() }
  }
  async function toggle(item) {
    const { error } = await supabase.from('trip_checklist_items').update({ completed: !item.completed, updated_at: new Date().toISOString() }).eq('id', item.id)
    if (error) setMessage(error.message)
    else setItems((current) => current.map((value) => value.id === item.id ? { ...value, completed: !value.completed } : value))
  }
  async function remove(item) {
    const { error } = await supabase.from('trip_checklist_items').delete().eq('id', item.id)
    if (error) setMessage(error.message); else setItems((current) => current.filter((value) => value.id !== item.id))
  }
  async function uploadDocument(file) {
    if (!file || busy) return
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setMessage('PDF, JPG, PNG, WebP 파일을 10MB 이하로 선택해 주세요.'); return
    }
    setBusy(true)
    const extension = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'bin'
    const path = `${trip.id}/documents/${session.user.id}-${Date.now()}.${extension}`
    const upload = await supabase.storage.from('trip-files').upload(path, file, { contentType: file.type })
    const saved = upload.error ? upload : await supabase.from('attachments').insert({ trip_id: trip.id, uploaded_by: session.user.id, storage_path: path, kind: 'document', caption: file.name }).select().single()
    if (saved.error) { if (!upload.error) await supabase.storage.from('trip-files').remove([path]); setMessage(saved.error.message) }
    else { setDocuments((current) => [saved.data, ...current]); setMessage('예약 문서를 저장했습니다.') }
    setBusy(false)
  }
  async function openDocument(document) {
    const { data, error } = await supabase.storage.from('trip-files').createSignedUrl(document.storage_path, 300)
    if (error) setMessage(error.message); else window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }
  async function removeDocument(document) {
    if (!window.confirm('이 문서를 삭제할까요?')) return
    const storage = await supabase.storage.from('trip-files').remove([document.storage_path])
    const row = storage.error ? storage : await supabase.from('attachments').delete().eq('id', document.id)
    if (row.error) setMessage(row.error.message); else setDocuments((current) => current.filter((value) => value.id !== document.id))
  }

  return <section className="saved-section trip-essentials">
    <div className="section-heading"><div><p className="section-label">{trip.title} · 준비</p><h2>체크리스트와 예약 문서</h2></div>{canEdit && <label className="mini-add document-upload">📎 문서 추가<input type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(event) => uploadDocument(event.target.files?.[0])} /></label>}</div>
    {canEdit && <form className="checklist-add" onSubmit={addItem}><input name="title" maxLength="200" placeholder="예: 여권, eSIM, 여행자보험" /><button type="submit">추가</button></form>}
    <div className="checklist">{items.map((item) => <article className={item.completed ? 'is-done' : ''} key={item.id}><button type="button" onClick={() => canEdit && toggle(item)}>{item.completed ? '✓' : '○'}</button><span>{item.title}</span>{canEdit && <button type="button" onClick={() => remove(item)}>삭제</button>}</article>)}</div>
    <div className="document-list">{documents.map((document) => <article key={document.id}><button type="button" onClick={() => openDocument(document)}>📄 <span>{document.caption || '예약 문서'}</span></button>{canEdit && <button type="button" onClick={() => removeDocument(document)}>삭제</button>}</article>)}</div>
    {message && <p className="auth-message" role="status">{message}</p>}
  </section>
}
