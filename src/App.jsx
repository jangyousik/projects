import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { BottomNav } from './components/BottomNav'
import { AuthPanel } from './components/AuthPanel'
import { GooglePlaceSearch } from './components/GooglePlaceSearch'
import { TripLiveTools } from './components/TripLiveTools'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { registerMobileAuth } from './lib/mobileAuth'
import { downloadScheduleTemplate, exportTripSchedule, readScheduleWorkbook } from './lib/tripExcel'

const ExternalApps = registerPlugin('ExternalApps')

function getScheduleMapUrl(schedule, trip) {
  const storedUrl = schedule.memo?.match(/지도:\s*(https?:\/\/[^\s·]+)/i)?.[1]
  if (storedUrl) return storedUrl
  const query = [schedule.place, schedule.address, schedule.title, trip?.destination].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function getTripCountdown(trip) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(`${trip.startDate}T00:00:00`)
  const end = new Date(`${trip.endDate}T00:00:00`)
  const dayMs = 24 * 60 * 60 * 1000
  if (today < start) return `D-${Math.ceil((start - today) / dayMs)}`
  if (today <= end) return `여행중 · DAY ${Math.floor((today - start) / dayMs) + 1}`
  return '여행 완료'
}

async function openGrabForSchedule(schedule, trip) {
  const destination = [schedule.place, schedule.address, schedule.title, trip?.destination].filter(Boolean).join(', ')
  try { await navigator.clipboard.writeText(destination) } catch { /* Clipboard permission is optional. */ }

  if (Capacitor.isNativePlatform()) {
    try {
      await ExternalApps.openGrab()
      return
    } catch { /* Older APKs fall through to the Android intent. */ }
  }

  const fallback = encodeURIComponent('https://play.google.com/store/apps/details?id=com.grabtaxi.passenger')
  window.location.href = `intent://open?screenType=BOOKING#Intent;scheme=grab;package=com.grabtaxi.passenger;S.browser_fallback_url=${fallback};end`
}

function App() {
  const [dialog, setDialog] = useState(null)
  const [trips, setTrips] = useState([])
  const [places, setPlaces] = useState([])
  const [schedules, setSchedules] = useState([])
  const [expenses, setExpenses] = useState([])
  const [members, setMembers] = useState([])
  const [session, setSession] = useState(null)
  const [selectedTripId, setSelectedTripId] = useState(null)
  const [setupTripId, setSetupTripId] = useState(null)
  const [selectedScheduleDate, setSelectedScheduleDate] = useState(null)
  const [screen, setScreen] = useState('home')
  const [tripsLoading, setTripsLoading] = useState(false)
  const [tripMessage, setTripMessage] = useState('')
  const [itemLoading, setItemLoading] = useState(false)
  const [itemMessage, setItemMessage] = useState('')
  const [editingItem, setEditingItem] = useState(null)
  const [placeDraft, setPlaceDraft] = useState({ name: '', address: '', memo: '', googlePlaceId: '', googleMapsUrl: '', latitude: '', longitude: '' })
  const excelInputRef = useRef(null)

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let cleanup = () => {}
    registerMobileAuth((error) => setTripMessage(`로그인을 완료하지 못했습니다: ${error.message}`))
      .then((removeListener) => { cleanup = removeListener })
    return () => cleanup()
  }, [])

  useEffect(() => {
    if (!session || !isSupabaseConfigured) {
      setTrips([])
      setSelectedTripId(null)
      setPlaces([])
      setSchedules([])
      setExpenses([])
      setMembers([])
      return
    }

    let active = true
    const loadTrips = async () => {
      setTripsLoading(true)
      const { data, error } = await supabase
        .from('trips')
        .select('id,owner_id,title,destination,start_date,end_date,people,currency')
        .order('start_date', { ascending: true })

      if (!active) return
      if (error) {
        setTripMessage(`여행 목록을 불러오지 못했습니다: ${error.message}`)
      } else {
        const mappedTrips = (data || []).map((trip) => ({
          id: trip.id,
          ownerId: trip.owner_id,
          title: trip.title,
          destination: trip.destination,
          startDate: trip.start_date,
          endDate: trip.end_date,
          people: trip.people,
          currency: trip.currency,
        }))
        setTrips(mappedTrips)
        setSelectedTripId((current) => mappedTrips.some((trip) => trip.id === current) ? current : mappedTrips[0]?.id || null)
        setTripMessage('')
      }
      setTripsLoading(false)
    }

    loadTrips()
    return () => { active = false }
  }, [session])

  useEffect(() => {
    if (!session || !selectedTripId || !supabase) {
      setPlaces([])
      setSchedules([])
      setExpenses([])
      setMembers([])
      return
    }

    let active = true
    const loadTripItems = async () => {
      setItemLoading(true)
      setItemMessage('')
      const [placesResult, schedulesResult, expensesResult, membersResult] = await Promise.all([
        supabase
          .from('places')
          .select('id,name,address,memo,latitude,longitude,google_place_id,google_maps_url')
          .eq('trip_id', selectedTripId)
          .order('created_at', { ascending: true }),
        supabase
          .from('schedule_items')
          .select('id,day_date,start_time,title,place_name,address,memo,completed,estimated_cost,actual_cost,sort_order,reservation_status,reservation_site,reservation_reference,reservation_url')
          .eq('trip_id', selectedTripId)
          .order('day_date', { ascending: true })
          .order('start_time', { ascending: true }),
        supabase
          .from('expenses')
          .select('id,schedule_item_id,category,title,amount,currency,spent_at,memo')
          .eq('trip_id', selectedTripId)
          .order('spent_at', { ascending: false }),
        supabase
          .from('trip_members')
          .select('user_id,role,joined_at,profiles!trip_members_user_id_fkey(display_name,avatar_url)')
          .eq('trip_id', selectedTripId)
          .order('joined_at', { ascending: true }),
      ])

      if (!active) return
      if (placesResult.error || schedulesResult.error || expensesResult.error || membersResult.error) {
        setItemMessage(`여행 정보를 불러오지 못했습니다: ${(placesResult.error || schedulesResult.error || expensesResult.error || membersResult.error).message}`)
      } else {
        setPlaces(placesResult.data || [])
        setSchedules((schedulesResult.data || []).map((item) => ({
          id: item.id,
          title: item.title,
          date: item.day_date,
          time: item.start_time?.slice(0, 5) || '',
          place: item.place_name,
          address: item.address,
          memo: item.memo,
          completed: item.completed,
          estimatedCost: Number(item.estimated_cost),
          actualCost: Number(item.actual_cost),
          reservationStatus: item.reservation_status,
          reservationSite: item.reservation_site,
          reservationReference: item.reservation_reference,
          reservationUrl: item.reservation_url,
        })))
        setExpenses((expensesResult.data || []).map((expense) => ({
          id: expense.id,
          scheduleItemId: expense.schedule_item_id,
          category: expense.category || '기타',
          title: expense.title,
          amount: Number(expense.amount),
          currency: expense.currency,
          spentAt: expense.spent_at,
          memo: expense.memo,
        })))
        setMembers((membersResult.data || []).map((member) => ({
          userId: member.user_id,
          role: member.role,
          joinedAt: member.joined_at,
          displayName: member.profiles?.display_name || '여행 멤버',
          avatarUrl: member.profiles?.avatar_url || null,
        })))
      }
      setItemLoading(false)
    }

    loadTripItems()
    return () => { active = false }
  }, [session, selectedTripId])

  const selectedTrip = trips.find((trip) => trip.id === selectedTripId) || null
  const isTripDetail = Boolean(session) && screen === 'trip' && Boolean(selectedTrip)
  const scheduleDates = [...new Set(schedules.map((schedule) => schedule.date))].sort()
  const activeScheduleDate = scheduleDates.includes(selectedScheduleDate) ? selectedScheduleDate : scheduleDates[0]
  const visibleSchedules = schedules.filter((schedule) => schedule.date === activeScheduleDate)

  const openTripDetail = (tripId) => {
    setSetupTripId(null)
    setSelectedScheduleDate(null)
    setSelectedTripId(tripId)
    setScreen('trip')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openItemDialog = (type) => {
    setItemMessage('')
    setEditingItem(null)
    if (!session) {
      setDialog('auth')
    } else if (type === 'place') {
      setPlaceDraft({ name: '', address: '', memo: '', googlePlaceId: '', googleMapsUrl: '', latitude: '', longitude: '' })
      setDialog('place')
    } else if (!selectedTripId) {
      setTripMessage('먼저 새 여행을 만들어 주세요.')
      setDialog('trip')
    } else if (!canEditTrip) {
      setItemMessage('보기 전용 멤버는 내용을 추가하거나 변경할 수 없습니다.')
    } else {
      setDialog(type)
    }
  }

  const openEditDialog = (type, item) => {
    setItemMessage('')
    setEditingItem({ type, item })
    if (type === 'place') {
      setPlaceDraft({
        name: item.name || '', address: item.address || '', memo: item.memo || '',
        googlePlaceId: item.google_place_id || '', googleMapsUrl: item.google_maps_url || '',
        latitude: item.latitude ?? '', longitude: item.longitude ?? '',
      })
    }
    setDialog(`${type}-edit`)
  }

  const openTripDialog = () => {
    setTripMessage('')
    setDialog(session ? 'trip' : 'auth')
  }

  const saveTrip = async (event) => {
    event.preventDefault()
    if (!session || !supabase) {
      setDialog('auth')
      return
    }

    const form = new FormData(event.currentTarget)
    const destination = String(form.get('destination')).trim()
    const title = String(form.get('title')).trim() || `${destination} 여행`
    const startDate = String(form.get('startDate'))
    const endDate = String(form.get('endDate'))
    const people = Number(form.get('people'))

    if (endDate < startDate) {
      setTripMessage('도착일은 출발일보다 빠를 수 없습니다.')
      return
    }

    setTripsLoading(true)
    setTripMessage('')
    const values = {
        owner_id: session.user.id,
        title,
        destination,
        start_date: startDate,
        end_date: endDate,
        people,
        currency: 'VND',
      }
    const query = editingItem?.type === 'trip'
      ? supabase.from('trips').update({ title, destination, start_date: startDate, end_date: endDate, people }).eq('id', editingItem.item.id)
      : supabase.from('trips').insert(values)
    const { data, error } = await query
      .select('id,owner_id,title,destination,start_date,end_date,people,currency')
      .single()

    setTripsLoading(false)
    if (error) {
      setTripMessage(`여행을 저장하지 못했습니다: ${error.message}`)
      return
    }

    const savedTrip = {
      id: data.id,
      ownerId: data.owner_id,
      title: data.title,
      destination: data.destination,
      startDate: data.start_date,
      endDate: data.end_date,
      people: data.people,
      currency: data.currency,
    }
    const isEditingTrip = editingItem?.type === 'trip'
    setTrips((current) => (isEditingTrip
      ? current.map((trip) => trip.id === savedTrip.id ? savedTrip : trip)
      : [...current, savedTrip]
    ).sort((a, b) => a.startDate.localeCompare(b.startDate)))
    setSelectedTripId(data.id)
    setSetupTripId(isEditingTrip ? null : data.id)
    setScreen('trip')
    setEditingItem(null)
    setDialog(null)
  }

  const deleteTrip = async (trip) => {
    if (!window.confirm(`‘${trip.title}’ 여행을 삭제할까요? 일정, 장소, 경비와 첨부파일도 함께 삭제되며 되돌릴 수 없습니다.`)) return
    setTripsLoading(true)
    setTripMessage('')
    const { error } = await supabase.from('trips').delete().eq('id', trip.id)
    setTripsLoading(false)
    if (error) {
      setTripMessage(`여행을 삭제하지 못했습니다: ${error.message}`)
      return
    }
    const remaining = trips.filter((item) => item.id !== trip.id)
    setTrips(remaining)
    setSelectedTripId(remaining[0]?.id || null)
  }

  const savePlace = async (event) => {
    event.preventDefault()
    if (!session || !selectedTripId || !supabase) return
    const form = new FormData(event.currentTarget)
    setItemLoading(true)
    setItemMessage('')
    const values = {
      name: String(form.get('name')).trim(),
      address: String(form.get('address')).trim() || null,
      memo: String(form.get('memo')).trim() || null,
      google_place_id: String(form.get('googlePlaceId')).trim() || null,
      google_maps_url: String(form.get('googleMapsUrl')).trim() || null,
      latitude: String(form.get('latitude')).trim() || null,
      longitude: String(form.get('longitude')).trim() || null,
    }
    const isPlaceEdit = editingItem?.type === 'place'
    const query = isPlaceEdit
      ? supabase.from('places').update(values).eq('id', editingItem.item.id).eq('trip_id', selectedTripId)
      : supabase.from('places').insert({ ...values, trip_id: selectedTripId, created_by: session.user.id })
    const { data, error } = await query
      .select('id,name,address,memo,google_place_id,google_maps_url,latitude,longitude')
      .single()
    setItemLoading(false)
    if (error) {
      setItemMessage(`장소를 저장하지 못했습니다: ${error.message}`)
      return
    }
    setPlaces((current) => isPlaceEdit
      ? current.map((place) => place.id === data.id ? data : place)
      : [...current, data])
    setEditingItem(null)
    setDialog(null)
  }

  const selectGooglePlace = useCallback((place) => {
    setPlaceDraft((current) => ({ ...current, ...place }))
  }, [])

  const saveSchedule = async (event) => {
    event.preventDefault()
    if (!session || !selectedTripId || !supabase) return
    const form = new FormData(event.currentTarget)
    const date = String(form.get('date'))
    if (selectedTrip && (date < selectedTrip.startDate || date > selectedTrip.endDate)) {
      setItemMessage('일정 날짜는 여행 기간 안에서 선택해 주세요.')
      return
    }
    setItemLoading(true)
    setItemMessage('')
    const values = {
        day_date: date,
        start_time: String(form.get('time')) || null,
        title: String(form.get('title')).trim(),
        place_name: String(form.get('place')).trim() || null,
        address: String(form.get('address')).trim() || null,
        memo: String(form.get('memo')).trim() || null,
        estimated_cost: Number(form.get('estimatedCost') || 0),
        reservation_status: String(form.get('reservationStatus') || 'none'),
        reservation_site: String(form.get('reservationSite')).trim() || null,
        reservation_reference: String(form.get('reservationReference')).trim() || null,
        reservation_url: String(form.get('reservationUrl')).trim() || null,
      }
    const query = editingItem?.type === 'schedule'
      ? supabase.from('schedule_items').update(values).eq('id', editingItem.item.id).eq('trip_id', selectedTripId)
      : supabase.from('schedule_items').insert({ ...values, trip_id: selectedTripId, created_by: session.user.id })
    const { data, error } = await query
      .select('id,day_date,start_time,title,place_name,address,memo,completed,estimated_cost,actual_cost,reservation_status,reservation_site,reservation_reference,reservation_url')
      .single()
    setItemLoading(false)
    if (error) {
      setItemMessage(`일정을 저장하지 못했습니다: ${error.message}`)
      return
    }
    const savedSchedule = {
      id: data.id,
      title: data.title,
      date: data.day_date,
      time: data.start_time?.slice(0, 5) || '',
      place: data.place_name,
      address: data.address,
      memo: data.memo,
      completed: data.completed,
      estimatedCost: Number(data.estimated_cost),
      actualCost: Number(data.actual_cost),
      reservationStatus: data.reservation_status,
      reservationSite: data.reservation_site,
      reservationReference: data.reservation_reference,
      reservationUrl: data.reservation_url,
    }
    setSchedules((current) => (editingItem?.type === 'schedule'
      ? current.map((item) => item.id === savedSchedule.id ? savedSchedule : item)
      : [...current, savedSchedule]
    ).sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)))
    setEditingItem(null)
    setDialog(null)
  }

  const saveExpense = async (event) => {
    event.preventDefault()
    if (!session || !selectedTripId || !supabase) return
    const form = new FormData(event.currentTarget)
    const values = {
      schedule_item_id: String(form.get('scheduleItemId')) || null,
      category: String(form.get('category')),
      title: String(form.get('title')).trim(),
      amount: Number(form.get('amount')),
      currency: String(form.get('currency')),
      spent_at: new Date(String(form.get('spentAt'))).toISOString(),
      memo: String(form.get('memo')).trim() || null,
    }
    setItemLoading(true)
    setItemMessage('')
    const query = editingItem?.type === 'expense'
      ? supabase.from('expenses').update(values).eq('id', editingItem.item.id).eq('trip_id', selectedTripId)
      : supabase.from('expenses').insert({ ...values, trip_id: selectedTripId, paid_by: session.user.id })
    const { data, error } = await query
      .select('id,schedule_item_id,category,title,amount,currency,spent_at,memo')
      .single()
    setItemLoading(false)
    if (error) {
      setItemMessage(`경비를 저장하지 못했습니다: ${error.message}`)
      return
    }
    const savedExpense = {
      id: data.id,
      scheduleItemId: data.schedule_item_id,
      category: data.category || '기타',
      title: data.title,
      amount: Number(data.amount),
      currency: data.currency,
      spentAt: data.spent_at,
      memo: data.memo,
    }
    setExpenses((current) => (editingItem?.type === 'expense'
      ? current.map((expense) => expense.id === savedExpense.id ? savedExpense : expense)
      : [savedExpense, ...current]
    ).sort((a, b) => b.spentAt.localeCompare(a.spentAt)))
    setEditingItem(null)
    setDialog(null)
  }

  const toggleSchedule = async (schedule) => {
    if (!session || !selectedTripId || !supabase || itemLoading) return

    const completed = !schedule.completed
    let actualCost = schedule.actualCost || 0
    if (completed) {
      const enteredCost = window.prompt(
        '완료 금액을 입력하세요. (베트남 동)',
        String(schedule.actualCost || schedule.estimatedCost || 0),
      )
      if (enteredCost === null) return
      actualCost = Number(enteredCost.replace(/[^0-9.]/g, ''))
      if (!Number.isFinite(actualCost) || actualCost < 0) {
        setItemMessage('완료 금액을 올바르게 입력해 주세요.')
        return
      }
    }

    setItemLoading(true)
    setItemMessage('')
    const { data, error } = await supabase
      .from('schedule_items')
      .update({ completed, actual_cost: actualCost, updated_at: new Date().toISOString() })
      .eq('id', schedule.id)
      .eq('trip_id', selectedTripId)
      .select('completed,actual_cost')
      .single()
    setItemLoading(false)
    if (error) {
      setItemMessage(`완료 상태를 변경하지 못했습니다: ${error.message}`)
      return
    }
    setSchedules((current) => current.map((item) => item.id === schedule.id ? {
      ...item,
      completed: data.completed,
      actualCost: Number(data.actual_cost),
    } : item))
    setItemMessage(data.completed ? `완료 처리했습니다. 실제 금액 ${Number(data.actual_cost).toLocaleString('ko-KR')}₫` : '완료를 취소했습니다.')
  }

  const deleteItem = async (type, item) => {
    const label = type === 'schedule' ? '일정' : type === 'expense' ? '경비' : '장소'
    if (!window.confirm(`이 ${label}를 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.`)) return
    setItemLoading(true)
    setItemMessage('')
    const table = type === 'schedule' ? 'schedule_items' : type === 'expense' ? 'expenses' : 'places'
    const { error } = await supabase.from(table).delete().eq('id', item.id).eq('trip_id', selectedTripId)
    setItemLoading(false)
    if (error) {
      setItemMessage(`${label}를 삭제하지 못했습니다: ${error.message}`)
      return
    }
    if (type === 'schedule') setSchedules((current) => current.filter((schedule) => schedule.id !== item.id))
    else if (type === 'expense') setExpenses((current) => current.filter((expense) => expense.id !== item.id))
    else setPlaces((current) => current.filter((place) => place.id !== item.id))
  }

  const shareTrip = async (event) => {
    event.preventDefault()
    if (!selectedTripId || !session || !supabase) return
    const form = new FormData(event.currentTarget)
    setItemLoading(true)
    setItemMessage('')
    const { data, error } = await supabase.rpc('add_trip_member_by_email', {
      target_trip: selectedTripId,
      target_email: String(form.get('email')).trim(),
      member_role: String(form.get('role')),
    })
    setItemLoading(false)
    if (error) {
      setItemMessage(`초대하지 못했습니다: ${error.message}`)
      return
    }
    const added = data?.[0]
    if (added) {
      setMembers((current) => {
        const nextMember = {
          userId: added.user_id,
          displayName: added.display_name || '여행 멤버',
          role: added.role,
          joinedAt: new Date().toISOString(),
          avatarUrl: null,
        }
        return current.some((member) => member.userId === nextMember.userId)
          ? current.map((member) => member.userId === nextMember.userId ? { ...member, ...nextMember } : member)
          : [...current, nextMember]
      })
    }
    setDialog(null)
  }

  const updateMemberRole = async (member, role) => {
    setItemLoading(true)
    setItemMessage('')
    const { error } = await supabase
      .from('trip_members')
      .update({ role })
      .eq('trip_id', selectedTripId)
      .eq('user_id', member.userId)
    setItemLoading(false)
    if (error) {
      setItemMessage(`권한을 변경하지 못했습니다: ${error.message}`)
      return
    }
    setMembers((current) => current.map((item) => item.userId === member.userId ? { ...item, role } : item))
  }

  const removeMember = async (member) => {
    if (!window.confirm(`${member.displayName} 님을 이 여행에서 내보낼까요?`)) return
    setItemLoading(true)
    setItemMessage('')
    const { error } = await supabase
      .from('trip_members')
      .delete()
      .eq('trip_id', selectedTripId)
      .eq('user_id', member.userId)
    setItemLoading(false)
    if (error) {
      setItemMessage(`멤버를 내보내지 못했습니다: ${error.message}`)
      return
    }
    setMembers((current) => current.filter((item) => item.userId !== member.userId))
  }

  const expenseTotals = expenses.reduce((totals, expense) => ({
    ...totals,
    [expense.currency]: (totals[expense.currency] || 0) + expense.amount,
  }), {})

  const isTripOwner = selectedTrip?.ownerId === session?.user.id
  const currentMembership = members.find((member) => member.userId === session?.user.id)
  const canEditTrip = isTripOwner || currentMembership?.role === 'editor'

  const formatMoney = (amount, currency) => new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'VND' || currency === 'KRW' ? 0 : 2,
  }).format(amount)

  const toLocalDateTimeValue = (value) => {
    const date = value ? new Date(value) : new Date()
    const offset = date.getTimezoneOffset() * 60000
    return new Date(date.getTime() - offset).toISOString().slice(0, 16)
  }

  const importScheduleExcel = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !selectedTrip || !session || !canEditTrip) return
    setItemLoading(true)
    setItemMessage('')
    try {
      const rows = await readScheduleWorkbook(file, selectedTrip)
      const { data, error } = await supabase
        .from('schedule_items')
        .insert(rows.map((row, index) => ({
          ...row,
          trip_id: selectedTrip.id,
          created_by: session.user.id,
          sort_order: schedules.length + index,
        })))
        .select('id,day_date,start_time,title,place_name,address,memo,completed,estimated_cost,actual_cost,reservation_status,reservation_site,reservation_reference,reservation_url')
      if (error) throw error
      const imported = (data || []).map((item) => ({
        id: item.id,
        title: item.title,
        date: item.day_date,
        time: item.start_time?.slice(0, 5) || '',
        place: item.place_name,
        address: item.address,
        memo: item.memo,
        completed: item.completed,
        estimatedCost: Number(item.estimated_cost),
        actualCost: Number(item.actual_cost),
        reservationStatus: item.reservation_status,
        reservationSite: item.reservation_site,
        reservationReference: item.reservation_reference,
        reservationUrl: item.reservation_url,
      }))
      setSchedules((current) => [...current, ...imported].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)))
      setItemMessage(`${imported.length}개의 일정을 Excel에서 가져왔습니다.`)
    } catch (error) {
      setItemMessage(`Excel 업로드 실패: ${error.message}`)
    } finally {
      setItemLoading(false)
    }
  }

  const importLegacyHanoiSchedule = async () => {
    if (!selectedTrip || !session || !supabase || !isTripOwner) return
    setItemLoading(true)
    setItemMessage('')
    try {
      const response = await fetch('/hanoi-trip.html')
      if (!response.ok) throw new Error('기존 하노이 일정 파일을 열 수 없습니다.')
      const documentHtml = new DOMParser().parseFromString(await response.text(), 'text/html')
      const existingKeys = new Set(schedules.map((item) => `${item.date}|${item.time || ''}|${item.title}`))
      const rows = []

      documentHtml.querySelectorAll('.day-section[id^="day"]').forEach((daySection) => {
        const dayIndex = Number(daySection.id.replace('day', ''))
        if (!Number.isInteger(dayIndex)) return
        const dayDate = new Date(`${selectedTrip.startDate}T00:00:00`)
        dayDate.setDate(dayDate.getDate() + dayIndex)
        const date = dayDate.toISOString().slice(0, 10)

        daySection.querySelectorAll('.schedule-item').forEach((item, sortOrder) => {
          const rawTime = item.querySelector('.time')?.textContent.trim() || ''
          const time = /^\d{1,2}:\d{2}$/.test(rawTime) ? rawTime.padStart(5, '0') : null
          const title = item.querySelector('.card-title')?.textContent.trim()
          if (!title || existingKeys.has(`${date}|${time || ''}|${title}`)) return
          const category = item.querySelector('.card-category')?.textContent.trim() || ''
          const priceText = item.querySelector('.price-tag')?.textContent.trim() || ''
          const mapUrl = item.querySelector('.map-btn')?.href || ''
          const cardText = item.querySelector('.card')?.textContent.replace(/\s+/g, ' ').trim() || ''
          const vndCost = priceText.includes('₫') ? Number(priceText.replace(/[^0-9]/g, '')) || 0 : 0
          const memoParts = [category, rawTime && !time ? `시간: ${rawTime}` : '', cardText, mapUrl ? `지도: ${mapUrl}` : ''].filter(Boolean)

          rows.push({
            trip_id: selectedTrip.id,
            day_date: date,
            start_time: time,
            title,
            memo: memoParts.join(' · ').slice(0, 1800),
            estimated_cost: vndCost,
            actual_cost: 0,
            completed: false,
            sort_order: sortOrder,
            reservation_status: item.querySelector('.pay-badge.done') ? 'booked' : 'none',
            created_by: session.user.id,
          })
        })
      })

      if (!rows.length) {
        setItemMessage('가져올 새로운 하노이 일정이 없습니다.')
        return
      }

      const { data, error } = await supabase.from('schedule_items').insert(rows)
        .select('id,day_date,start_time,title,place_name,address,memo,completed,estimated_cost,actual_cost,reservation_status,reservation_site,reservation_reference,reservation_url')
      if (error) throw error
      const imported = data.map((item) => ({
        id: item.id, date: item.day_date, time: item.start_time?.slice(0, 5) || '', title: item.title,
        place: item.place_name, address: item.address, memo: item.memo, completed: item.completed,
        estimatedCost: Number(item.estimated_cost), actualCost: Number(item.actual_cost),
        reservationStatus: item.reservation_status, reservationSite: item.reservation_site,
        reservationReference: item.reservation_reference, reservationUrl: item.reservation_url,
      }))
      setSchedules((current) => [...current, ...imported].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)))
      setItemMessage(`기존 하노이 일정 ${imported.length}개를 가져왔습니다.`)
    } catch (error) {
      setItemMessage(`하노이 일정 가져오기 실패: ${error.message}`)
    } finally {
      setItemLoading(false)
    }
  }

  const restoreHanoiFamilyTrip = async () => {
    if (!session || !supabase || session.user.email?.toLowerCase() !== 'jys7867@gmail.com') return

    setTripsLoading(true)
    setTripMessage('하노이 가족여행을 DB로 이전하고 있습니다...')
    try {
      const { data: existingTrip, error: existingError } = await supabase
        .from('trips')
        .select('id,owner_id,title,destination,start_date,end_date,people,currency')
        .eq('owner_id', session.user.id)
        .eq('title', '하노이 가족 여행')
        .maybeSingle()
      if (existingError) throw existingError

      let tripData = existingTrip
      if (!tripData) {
        const { data, error } = await supabase.from('trips').insert({
          owner_id: session.user.id,
          title: '하노이 가족 여행',
          destination: '베트남 · 하노이',
          start_date: '2026-09-10',
          end_date: '2026-09-13',
          people: 4,
          currency: 'VND',
        }).select('id,owner_id,title,destination,start_date,end_date,people,currency').single()
        if (error) throw error
        tripData = data
      }

      const response = await fetch('/hanoi-trip.html', { cache: 'no-store' })
      if (!response.ok) throw new Error('기존 하노이 일정 파일을 열 수 없습니다.')
      const documentHtml = new DOMParser().parseFromString(await response.text(), 'text/html')
      const { data: savedSchedules, error: scheduleError } = await supabase
        .from('schedule_items')
        .select('day_date,start_time,title')
        .eq('trip_id', tripData.id)
      if (scheduleError) throw scheduleError

      const existingKeys = new Set((savedSchedules || []).map((item) => `${item.day_date}|${item.start_time?.slice(0, 5) || ''}|${item.title}`))
      const rows = []
      documentHtml.querySelectorAll('.day-section[id^="day"]').forEach((daySection) => {
        const dayIndex = Number(daySection.id.replace('day', ''))
        if (!Number.isInteger(dayIndex)) return
        const dayDate = new Date(`${tripData.start_date}T00:00:00`)
        dayDate.setDate(dayDate.getDate() + dayIndex)
        const date = dayDate.toISOString().slice(0, 10)

        daySection.querySelectorAll('.schedule-item').forEach((item, sortOrder) => {
          const rawTime = item.querySelector('.time')?.textContent.trim() || ''
          const time = /^\d{1,2}:\d{2}$/.test(rawTime) ? rawTime.padStart(5, '0') : null
          const title = item.querySelector('.card-title')?.textContent.trim()
          if (!title || existingKeys.has(`${date}|${time || ''}|${title}`)) return
          const category = item.querySelector('.card-category')?.textContent.trim() || ''
          const priceText = item.querySelector('.price-tag')?.textContent.trim() || ''
          const mapUrl = item.querySelector('.map-btn')?.href || ''
          const cardText = item.querySelector('.card')?.textContent.replace(/\s+/g, ' ').trim() || ''
          const vndCost = priceText.includes('₫') ? Number(priceText.replace(/[^0-9]/g, '')) || 0 : 0
          const memoParts = [category, rawTime && !time ? `시간: ${rawTime}` : '', cardText, mapUrl ? `지도: ${mapUrl}` : ''].filter(Boolean)
          rows.push({
            trip_id: tripData.id,
            day_date: date,
            start_time: time,
            title,
            memo: memoParts.join(' · ').slice(0, 1800),
            estimated_cost: vndCost,
            actual_cost: 0,
            completed: false,
            sort_order: sortOrder,
            reservation_status: item.querySelector('.pay-badge.done') ? 'booked' : 'none',
            created_by: session.user.id,
          })
        })
      })

      if (rows.length) {
        const { error } = await supabase.from('schedule_items').insert(rows)
        if (error) throw error
      }

      const restoredTrip = {
        id: tripData.id,
        ownerId: tripData.owner_id,
        title: tripData.title,
        destination: tripData.destination,
        startDate: tripData.start_date,
        endDate: tripData.end_date,
        people: tripData.people,
        currency: tripData.currency,
      }
      setTrips([restoredTrip])
      setSelectedTripId(restoredTrip.id)
      setScreen('trip')
      setTripMessage(`하노이 가족여행과 새로운 일정 ${rows.length}개를 DB에 저장했습니다.`)
    } catch (error) {
      setTripMessage(`하노이 여행 이전 실패: ${error.message}`)
    } finally {
      setTripsLoading(false)
    }
  }

  return (
    <div className="app-shell">
      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">안녕하세요 👋</p>
            <h1>어디로 떠나볼까요?</h1>
          </div>
          <button className="profile-button" type="button" aria-label="로그인과 내 프로필" onClick={() => setDialog('auth')}>{session ? (session.user.user_metadata?.name?.slice(0, 2) || 'MY') : '로그인'}</button>
        </header>

        {isTripDetail && (
          <section className="trip-detail-header">
            <button type="button" onClick={() => { setSetupTripId(null); setScreen('home') }} aria-label="여행 목록으로 돌아가기">←</button>
            <div><p>{selectedTrip.destination}</p><h2>{selectedTrip.title}</h2><small>{selectedTrip.startDate} ~ {selectedTrip.endDate} · {selectedTrip.people}명</small></div>
          </section>
        )}

        {isTripDetail && <TripLiveTools trip={selectedTrip} />}

        {!session && (
          <section className="empty-home" aria-labelledby="login-first-title">
            <span aria-hidden="true">✈️</span>
            <h2 id="login-first-title">로그인하고 여행을 시작하세요</h2>
            <p>내가 만들었거나 초대받은 여행만 안전하게 표시됩니다.</p>
            <button type="button" onClick={() => setDialog('auth')}>로그인하기</button>
          </section>
        )}

        {screen === 'home' && session && !tripsLoading && trips.length === 0 && (
          <section className="empty-home" aria-labelledby="empty-trip-title">
            <span aria-hidden="true">🧳</span>
            <h2 id="empty-trip-title">아직 등록된 여행이 없어요</h2>
            <p>{session.user.email?.toLowerCase() === 'jys7867@gmail.com' ? '기존 하노이 4일 일정을 Supabase DB로 이전할 수 있습니다.' : '새 여행을 만들거나 소유자에게 초대를 요청해 주세요.'}</p>
            {session.user.email?.toLowerCase() === 'jys7867@gmail.com'
              ? <button type="button" onClick={restoreHanoiFamilyTrip}>하노이 4일 일정 복원</button>
              : <button type="button" onClick={openTripDialog}>새 여행 만들기</button>}
          </section>
        )}

        {isTripDetail && setupTripId === selectedTripId && (
          <section className="excel-section" aria-labelledby="excel-title">
            <div><p className="section-label">Excel 일정 관리</p><h2 id="excel-title">양식으로 한 번에 만들기</h2></div>
            <p>양식을 내려받아 일정을 입력한 뒤 그대로 업로드하세요. 예약 사이트와 예약 링크도 함께 등록됩니다.</p>
            <div className="excel-actions">
              <button type="button" onClick={() => downloadScheduleTemplate(selectedTrip)}>양식 다운로드</button>
              <button type="button" onClick={() => exportTripSchedule(selectedTrip, schedules)} disabled={!schedules.length}>현재 일정 내보내기</button>
              {canEditTrip && <button className="primary" type="button" onClick={() => excelInputRef.current?.click()} disabled={itemLoading}>Excel 업로드</button>}
              {isTripOwner && selectedTrip.destination.includes('하노이') && <button type="button" onClick={importLegacyHanoiSchedule} disabled={itemLoading}>기존 하노이 일정 가져오기</button>}
            </div>
            <input ref={excelInputRef} className="visually-hidden" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={importScheduleExcel} />
          </section>
        )}

        {isTripDetail && places.length > 0 && (
          <section className="saved-section">
            <p className="section-label">{selectedTrip?.title} · 저장한 장소</p>
            <div className="saved-list">{places.map((place) => (
              <div className="saved-place" key={place.id}>
                <span>📍</span><span><strong>{place.name}</strong><small>{place.memo || place.address || 'Google Maps에서 보기'}</small></span><b>›</b>
                <div className="item-actions">
                  <a href={place.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address || `${place.name}, ${selectedTrip?.destination || ''}`)}`} target="_blank" rel="noreferrer">지도</a>
                  {canEditTrip && <button type="button" onClick={() => openEditDialog('place', place)}>수정</button>}
                  {canEditTrip && <button className="danger" type="button" onClick={() => deleteItem('place', place)}>삭제</button>}
                </div>
              </div>
            ))}</div>
          </section>
        )}

        {isTripDetail && schedules.length > 0 && (
          <section className="saved-section">
            <p className="section-label">{selectedTrip?.title} · 일정</p>
            <div className="schedule-day-tabs" role="tablist" aria-label="여행 날짜 선택">
              {scheduleDates.map((date, index) => {
                const dateValue = new Date(`${date}T00:00:00`)
                const hanoiLabels = ['도착', '미딩', '올드쿼터', '귀국']
                const subtitle = selectedTrip.title.includes('하노이') ? hanoiLabels[index] : `${index + 1}일차`
                return <button className={activeScheduleDate === date ? 'is-active' : ''} type="button" role="tab" aria-selected={activeScheduleDate === date} onClick={() => setSelectedScheduleDate(date)} key={date}><strong>{dateValue.getDate()}</strong><small>{new Intl.DateTimeFormat('ko-KR', { weekday: 'short' }).format(dateValue)} · {subtitle}</small></button>
              })}
            </div>
            <div className="saved-list">{visibleSchedules.map((schedule) => (
              <div className={`saved-trip schedule-row ${schedule.completed ? 'is-completed' : ''}`} key={schedule.id}>
                <span className="schedule-date"><strong>{schedule.time || '일정'}</strong><small>{schedule.time ? '시간' : schedule.date.slice(5)}</small></span>
                <span><strong>{schedule.title}</strong><small>{schedule.place || schedule.memo || '세부 내용 없음'}</small>{(schedule.actualCost > 0 || schedule.estimatedCost > 0) && <small className="schedule-cost">{schedule.completed ? '실제' : '예상'} {(schedule.completed ? schedule.actualCost : schedule.estimatedCost).toLocaleString('ko-KR')}₫</small>}{schedule.reservationStatus !== 'none' && <em className={`reservation-badge is-${schedule.reservationStatus}`}>{schedule.reservationStatus === 'booked' ? '예약 완료' : schedule.reservationStatus === 'planned' ? '예약 예정' : '취소됨'}</em>}</span>
                <div className="item-actions">
                  <a href={getScheduleMapUrl(schedule, selectedTrip)} target="_blank" rel="noreferrer">📍 지도</a>
                  <button type="button" onClick={() => openGrabForSchedule(schedule, selectedTrip)}>🚕 Grab</button>
                  {canEditTrip && <>
                  <button type="button" onClick={() => toggleSchedule(schedule)} disabled={itemLoading}>{schedule.completed ? '완료 취소' : '완료'}</button>
                  <button type="button" onClick={() => openEditDialog('schedule', schedule)}>수정</button>
                  <button className="danger" type="button" onClick={() => deleteItem('schedule', schedule)}>삭제</button>
                  </>}
                </div>
                {schedule.reservationUrl && <div className="reservation-link"><a href={schedule.reservationUrl} target="_blank" rel="noreferrer">{schedule.reservationSite || '예약 사이트'} 열기</a>{schedule.reservationReference && <span>예약번호 {schedule.reservationReference}</span>}</div>}
              </div>
            ))}</div>
          </section>
        )}

        {isTripDetail && (
          <section className="saved-section expense-section">
            <div className="section-heading">
              <div><p className="section-label">{selectedTrip.title} · 경비</p><h2>지출 내역</h2></div>
              {canEditTrip && <button className="mini-add" type="button" onClick={() => openItemDialog('expense')}>＋ 추가</button>}
            </div>
            <div className="expense-summary">
              {Object.keys(expenseTotals).length === 0
                ? <span><small>총 지출</small><strong>아직 기록이 없습니다</strong></span>
                : Object.entries(expenseTotals).map(([currency, total]) => (
                  <span key={currency}><small>{currency} 합계</small><strong>{formatMoney(total, currency)}</strong></span>
                ))}
            </div>
            {expenses.length > 0 && <div className="expense-list">{expenses.map((expense) => (
              <article className="expense-row" key={expense.id}>
                <span className="expense-category">{expense.category}</span>
                <span><strong>{expense.title}</strong><small>{new Date(expense.spentAt).toLocaleString('ko-KR')} {expense.memo ? `· ${expense.memo}` : ''}</small></span>
                <strong className="expense-amount">{formatMoney(expense.amount, expense.currency)}</strong>
                {canEditTrip && <div className="item-actions">
                  <button type="button" onClick={() => openEditDialog('expense', expense)}>수정</button>
                  <button className="danger" type="button" onClick={() => deleteItem('expense', expense)}>삭제</button>
                </div>}
              </article>
            ))}</div>}
          </section>
        )}

        {isTripDetail && (
          <section className="saved-section member-section">
            <div className="section-heading">
              <div><p className="section-label">{selectedTrip.title} · 공유</p><h2>함께하는 사람</h2></div>
              {isTripOwner && <button className="mini-add" type="button" onClick={() => { setItemMessage(''); setDialog('share') }}>＋ 초대</button>}
            </div>
            <div className="member-list">{members.map((member) => (
              <article className="member-row" key={member.userId}>
                <span className="member-avatar">{member.displayName.slice(0, 1).toUpperCase()}</span>
                <span><strong>{member.displayName}</strong><small>{member.role === 'owner' ? '소유자' : member.role === 'editor' ? '편집 가능' : '보기 전용'}</small></span>
                {isTripOwner && member.role !== 'owner' && <div className="member-controls">
                  <select aria-label={`${member.displayName} 권한`} value={member.role} onChange={(event) => updateMemberRole(member, event.target.value)} disabled={itemLoading}>
                    <option value="editor">편집 가능</option><option value="viewer">보기 전용</option>
                  </select>
                  <button className="danger" type="button" onClick={() => removeMember(member)}>내보내기</button>
                </div>}
              </article>
            ))}</div>
            {!isTripOwner && <p className="member-help">여행 소유자만 멤버와 권한을 관리할 수 있습니다.</p>}
          </section>
        )}

        {screen === 'home' && session && trips.length > 0 && (
          <section className="saved-section">
            <p className="section-label">내가 만든 여행</p>
            <div className="saved-list">{trips.map((trip) => (
              <div className={`saved-trip trip-entry ${selectedTripId === trip.id ? 'is-selected' : ''}`} key={trip.id}>
                <button className="trip-select" type="button" onClick={() => openTripDetail(trip.id)}>
                  <span>✈️</span><span><strong>{trip.title}</strong><small>{trip.destination} · {trip.startDate} ~ {trip.endDate} · {trip.people}명</small></span><span className="trip-card-status"><em>{getTripCountdown(trip)}</em><b>{selectedTripId === trip.id ? '선택됨' : '선택'}</b></span>
                </button>
                {trip.title.includes('하노이') && (
                  <div className="trip-budget-summary" aria-label="하노이 여행 예산 요약">
                    <span><small>숙소</small><strong>₩765,669</strong></span>
                    <span><small>현금(동)</small><strong>9,040,000₫</strong></span>
                    <span><small>현지카드(동)</small><strong>4,300,000₫</strong></span>
                    <span><small>항공</small><strong>₩1,410,071</strong></span>
                  </div>
                )}
                {trip.ownerId === session?.user.id && <div className="item-actions">
                  <button type="button" onClick={() => openEditDialog('trip', trip)}>수정</button>
                  <button className="danger" type="button" onClick={() => deleteTrip(trip)}>삭제</button>
                </div>}
              </div>
            ))}</div>
          </section>
        )}

        {tripsLoading && <p className="data-status" role="status">여행 정보를 불러오는 중…</p>}
        {itemLoading && <p className="data-status" role="status">선택한 여행 정보를 처리하는 중…</p>}
        {tripMessage && !dialog && <p className="data-status is-error" role="alert">{tripMessage}</p>}
        {itemMessage && !dialog && <p className="data-status is-error" role="alert">{itemMessage}</p>}

        {screen === 'home' && session && trips.length > 0 && <button className="new-trip-button" type="button" onClick={openTripDialog}><span aria-hidden="true">＋</span> 새 여행 만들기</button>}
      </main>

      {session && <BottomNav />}

      {dialog && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}>
          <section className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <div className="dialog-handle" />
            <div className="dialog-heading"><div><p className="section-label">{dialog === 'auth' ? '여행온 계정' : '새로운 기록'}</p><h2 id="dialog-title">{dialog === 'trip' ? '새 여행 만들기' : dialog === 'trip-edit' ? '여행 수정' : dialog === 'schedule' ? '새 일정 만들기' : dialog === 'schedule-edit' ? '일정 수정' : dialog === 'place-edit' ? '장소 수정' : dialog === 'expense' ? '경비 기록' : dialog === 'expense-edit' ? '경비 수정' : dialog === 'share' ? '여행 공유' : dialog === 'auth' ? '로그인' : '장소 저장'}</h2></div><button type="button" onClick={() => { setDialog(null); setEditingItem(null) }} aria-label="닫기">×</button></div>
            {dialog === 'auth' ? (
              <AuthPanel session={session} onClose={() => setDialog(null)} />
            ) : dialog === 'trip' || dialog === 'trip-edit' ? (
              <form onSubmit={saveTrip}>
                <label>여행 이름<input name="title" required placeholder="예: 도쿄 가족 여행" defaultValue={editingItem?.item.title || ''} /></label>
                <label>여행지<input name="destination" required placeholder="예: 도쿄" defaultValue={editingItem?.item.destination || ''} /></label>
                <div className="form-row"><label>출발일<input name="startDate" type="date" required defaultValue={editingItem?.item.startDate || ''} /></label><label>도착일<input name="endDate" type="date" required defaultValue={editingItem?.item.endDate || ''} /></label></div>
                <label>인원<input name="people" type="number" inputMode="numeric" min="1" defaultValue={editingItem?.item.people || 1} required /></label>
                {tripMessage && <p className="auth-message" role="alert">{tripMessage}</p>}
                <button className="dialog-submit" type="submit" disabled={tripsLoading}>{tripsLoading ? '저장 중…' : '여행 저장'}</button>
              </form>
            ) : dialog === 'share' ? (
              <form onSubmit={shareTrip}>
                <label>가입한 사용자 이메일<input name="email" type="email" required placeholder="family@example.com" /></label>
                <label>권한<select name="role" defaultValue="editor"><option value="editor">편집 가능</option><option value="viewer">보기 전용</option></select></label>
                <p className="auth-notice">현재 단계에서는 여행온에 이미 가입한 사용자만 바로 초대할 수 있습니다.</p>
                {itemMessage && <p className="auth-message" role="alert">{itemMessage}</p>}
                <button className="dialog-submit" type="submit" disabled={itemLoading}>{itemLoading ? '초대 중…' : '여행에 초대'}</button>
              </form>
            ) : dialog === 'expense' || dialog === 'expense-edit' ? (
              <form onSubmit={saveExpense}>
                <label>사용 내역<input name="title" required placeholder="예: 가족 저녁 식사" defaultValue={editingItem?.item.title || ''} /></label>
                <div className="form-row">
                  <label>카테고리<select name="category" defaultValue={editingItem?.item.category || '식비'}><option>식비</option><option>교통</option><option>숙소</option><option>관광</option><option>쇼핑</option><option>기타</option></select></label>
                  <label>통화<select name="currency" defaultValue={editingItem?.item.currency || selectedTrip?.currency || 'VND'}><option value="VND">베트남 동</option><option value="KRW">한국 원</option><option value="USD">미국 달러</option></select></label>
                </div>
                <label>금액<input name="amount" type="number" inputMode="decimal" min="0" step="0.01" required placeholder="0" defaultValue={editingItem?.item.amount ?? ''} /></label>
                <label>사용 일시<input name="spentAt" type="datetime-local" required defaultValue={toLocalDateTimeValue(editingItem?.item.spentAt)} /></label>
                <label>연결 일정<select name="scheduleItemId" defaultValue={editingItem?.item.scheduleItemId || ''}><option value="">일정과 연결하지 않음</option>{schedules.map((schedule) => <option value={schedule.id} key={schedule.id}>{schedule.date} {schedule.time} · {schedule.title}</option>)}</select></label>
                <label>메모<textarea name="memo" maxLength="300" placeholder="결제 수단이나 상세 내용을 기록하세요" defaultValue={editingItem?.item.memo || ''} /></label>
                {itemMessage && <p className="auth-message" role="alert">{itemMessage}</p>}
                <button className="dialog-submit" type="submit" disabled={itemLoading}>{itemLoading ? '저장 중…' : '경비 저장'}</button>
              </form>
            ) : dialog === 'schedule' || dialog === 'schedule-edit' ? (
              <form onSubmit={saveSchedule}>
                <label>일정 이름<input name="title" required placeholder="예: 공항으로 출발" defaultValue={editingItem?.item.title || ''} /></label>
                <div className="form-row"><label>날짜<input name="date" type="date" min={selectedTrip?.startDate} max={selectedTrip?.endDate} defaultValue={editingItem?.item.date || ''} required /></label><label>시간<input name="time" type="time" defaultValue={editingItem?.item.time || ''} required /></label></div>
                <label>장소<input name="place" placeholder="예: 인천국제공항" defaultValue={editingItem?.item.place || ''} /></label>
                <label>주소<input name="address" placeholder="지도에서 찾을 수 있는 주소" defaultValue={editingItem?.item.address || ''} /></label>
                <label>메모<textarea name="memo" maxLength="300" placeholder="준비물이나 세부 내용을 기록하세요" defaultValue={editingItem?.item.memo || ''} /></label>
                <label>예상 비용<input name="estimatedCost" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={editingItem?.item.estimatedCost || 0} /></label>
                <div className="form-row"><label>예약 상태<select name="reservationStatus" defaultValue={editingItem?.item.reservationStatus || 'none'}><option value="none">예약 없음</option><option value="planned">예약 예정</option><option value="booked">예약 완료</option><option value="cancelled">취소됨</option></select></label><label>예약 사이트<input name="reservationSite" placeholder="예: Agoda, Klook" defaultValue={editingItem?.item.reservationSite || ''} /></label></div>
                <label>예약번호<input name="reservationReference" placeholder="예약번호 또는 티켓번호" defaultValue={editingItem?.item.reservationReference || ''} /></label>
                <label>예약 링크<input name="reservationUrl" type="url" placeholder="https://..." defaultValue={editingItem?.item.reservationUrl || ''} /></label>
                {itemMessage && <p className="auth-message" role="alert">{itemMessage}</p>}
                <button className="dialog-submit" type="submit" disabled={itemLoading}>{itemLoading ? '저장 중…' : '일정 저장'}</button>
              </form>
            ) : (
              <form onSubmit={savePlace}>
                <GooglePlaceSearch onSelect={selectGooglePlace} />
                <label>장소 이름<input name="name" required placeholder="예: Train Street" value={placeDraft.name} onChange={(event) => setPlaceDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                <label>주소<input name="address" placeholder="예: 3 P. Trần Phú, Hà Nội" value={placeDraft.address} onChange={(event) => setPlaceDraft((current) => ({ ...current, address: event.target.value }))} /></label>
                <label>메모<textarea name="memo" maxLength="200" placeholder="먹고 싶은 메뉴나 방문 이유" value={placeDraft.memo} onChange={(event) => setPlaceDraft((current) => ({ ...current, memo: event.target.value }))} /></label>
                <input type="hidden" name="googlePlaceId" value={placeDraft.googlePlaceId} />
                <input type="hidden" name="googleMapsUrl" value={placeDraft.googleMapsUrl} />
                <input type="hidden" name="latitude" value={placeDraft.latitude} />
                <input type="hidden" name="longitude" value={placeDraft.longitude} />
                {itemMessage && <p className="auth-message" role="alert">{itemMessage}</p>}
                <button className="dialog-submit" type="submit" disabled={itemLoading}>{itemLoading ? '저장 중…' : '장소 저장'}</button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default App
