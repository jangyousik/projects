import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { BottomNav } from './components/BottomNav'
import { AuthPanel } from './components/AuthPanel'
import { GooglePlaceSearch } from './components/GooglePlaceSearch'
import { TripLiveTools } from './components/TripLiveTools'
import { PersonalAiSettings } from './components/PersonalAiSettings'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { registerMobileAuth } from './lib/mobileAuth'
import { downloadScheduleTemplate, exportTripSchedule, readScheduleWorkbook, readWorkbookForAi } from './lib/tripExcel'

const ExternalApps = registerPlugin('ExternalApps')
const ReceiptOcr = registerPlugin('ReceiptOcr')

const CURRENCY_OPTIONS = [
  ['VND', '베트남 동'], ['KRW', '한국 원'], ['USD', '미국 달러'], ['JPY', '일본 엔'],
  ['THB', '태국 바트'], ['SGD', '싱가포르 달러'], ['EUR', '유로'], ['GBP', '영국 파운드'],
  ['CNY', '중국 위안'], ['TWD', '대만 달러'], ['PHP', '필리핀 페소'], ['MYR', '말레이시아 링깃'], ['IDR', '인도네시아 루피아'],
]

const COUNTRY_OPTIONS = [
  ['VN', '베트남', 'VND'], ['KR', '대한민국', 'KRW'], ['US', '미국', 'USD'], ['JP', '일본', 'JPY'],
  ['TH', '태국', 'THB'], ['SG', '싱가포르', 'SGD'], ['EU', '유럽', 'EUR'], ['GB', '영국', 'GBP'],
  ['CN', '중국', 'CNY'], ['TW', '대만', 'TWD'], ['PH', '필리핀', 'PHP'], ['MY', '말레이시아', 'MYR'], ['ID', '인도네시아', 'IDR'],
]

function parseCalendarDate(dateText) {
  const [year, month, day] = String(dateText || '').split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0)
}

function addDaysToDateText(dateText, days) {
  const [year, month, day] = String(dateText || '').split('-').map(Number)
  const date = new Date(Date.UTC(year, (month || 1) - 1, (day || 1) + days))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function getLocalDateText(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getScheduleMapUrl(schedule, trip) {
  const storedUrl = schedule.memo?.match(/지도:\s*(https?:\/\/[^\s·]+)/i)?.[1]
  if (storedUrl) return storedUrl
  const query = [schedule.place, schedule.address, schedule.title, trip?.destination].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function getTripCountdown(trip) {
  const todayText = getLocalDateText()
  const today = parseCalendarDate(todayText)
  const start = parseCalendarDate(trip.startDate)
  const dayMs = 24 * 60 * 60 * 1000
  if (todayText < trip.startDate) return `D-${Math.round((start - today) / dayMs)}`
  if (todayText <= trip.endDate) return `여행중 · DAY ${Math.round((today - start) / dayMs) + 1}`
  return '여행 완료'
}

function getTripPhaseLabel(trip) {
  const today = getLocalDateText()
  if (today < trip.startDate) return '여행을 준비해요 ✈️'
  if (today <= trip.endDate) return '즐거운 여행 중이에요 🌏'
  return '여행을 추억해요 📸'
}

function classifyLegacyCost(category, title) {
  const text = `${category} ${title}`.toLowerCase()
  if (/항공|비행|flight/.test(text)) return 'flight'
  if (/숙소|호텔|hotel/.test(text)) return 'accommodation'
  if (/식사|카페|레스토랑|뷔페|food/.test(text)) return 'food'
  if (/이동|그랩|grab|택시|교통/.test(text)) return 'transport'
  if (/쇼핑|마트|몰|시장/.test(text)) return 'shopping'
  if (/관광|마사지|스파|투어/.test(text)) return 'activity'
  return 'other'
}

function parseLegacyPrice(priceText) {
  return {
    amount: Number(priceText.replace(/[^0-9]/g, '')) || 0,
    currency: priceText.includes('₩') ? 'KRW' : priceText.includes('$') ? 'USD' : 'VND',
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('사진을 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })
}

function findReceiptAmount(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const amountFrom = (line) => [...line.matchAll(/\d[\d.,\s]*/g)]
    .map((match) => Number(match[0].replace(/[^0-9]/g, '')))
    .filter((amount) => Number.isFinite(amount) && amount > 0)
  const totalLines = lines.filter((line) => /총액|합계|결제금액|받을금액|total|amount|grand total|tổng|thanh toán|合計|お会計/i.test(line))
  const preferred = totalLines.flatMap(amountFrom)
  if (preferred.length) return Math.max(...preferred)
  const candidates = lines.flatMap(amountFrom).filter((amount) => amount >= 100)
  return candidates.length ? Math.max(...candidates) : 0
}

function buildTripBudgetSummary(trip, schedules = [], expenses = [], exchangeRates = null) {
  const categoryOf = (item) => item.costCategory || item.cost_category || 'other'
  const paymentOf = (item) => item.paymentMethod || item.payment_method || 'either'
  const currencyOf = (item) => item.costCurrency || item.cost_currency || trip.currency || 'VND'
  const summarize = (label, matcher, prepaid = false) => {
    const matches = schedules.filter(matcher)
    const amounts = {}
    const actuals = {}
    matches.forEach((item) => {
      const currency = currencyOf(item)
      amounts[currency] = (amounts[currency] || 0) + Number(item.estimatedCost ?? item.estimated_cost ?? 0)
      if (item.completed) actuals[currency] = (actuals[currency] || 0) + Number(item.actualCost ?? item.actual_cost ?? 0)
    })
    return {
      label,
      prepaid,
      amounts: Object.entries(amounts),
      actuals: Object.entries(actuals),
      fallbackCurrency: trip.currency || 'VND',
    }
  }
  const usedByCurrency = schedules.reduce((totals, item) => {
    const isPrepaid = paymentOf(item) === 'prepaid' || ['flight', 'accommodation'].includes(categoryOf(item))
    const used = isPrepaid
      ? Number(item.estimatedCost ?? item.estimated_cost ?? 0)
      : item.completed ? Number(item.actualCost ?? item.actual_cost ?? 0) : 0
    const currency = currencyOf(item)
    return { ...totals, [currency]: (totals[currency] || 0) + used }
  }, {})
  expenses.filter((item) => !(item.scheduleItemId || item.schedule_item_id)).forEach((item) => {
    const currency = item.currency || trip.currency || 'VND'
    usedByCurrency[currency] = (usedByCurrency[currency] || 0) + Number(item.amount || 0)
  })
  const totalCurrencies = Object.entries(usedByCurrency).filter(([, amount]) => amount > 0)
  const baseCurrency = 'KRW'
  const canConvert = Boolean(exchangeRates?.[baseCurrency]) && totalCurrencies.every(([currency]) => exchangeRates[currency])
  const convertedTotal = canConvert
    ? totalCurrencies.reduce((sum, [currency, amount]) => sum + (amount / exchangeRates[currency]) * exchangeRates[baseCurrency], 0)
    : (usedByCurrency[baseCurrency] || 0)
  return [
    { label: '총 사용금액', totals: totalCurrencies, convertedTotal, currency: baseCurrency, canConvert },
    summarize('호텔', (item) => categoryOf(item) === 'accommodation', true),
    summarize('현금', (item) => !['flight', 'accommodation'].includes(categoryOf(item)) && paymentOf(item) === 'cash'),
    summarize('카드', (item) => !['flight', 'accommodation'].includes(categoryOf(item)) && ['card', 'either'].includes(paymentOf(item))),
    summarize('항공', (item) => categoryOf(item) === 'flight', true),
  ]
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
  const [tripBudgetItems, setTripBudgetItems] = useState({ schedules: {}, expenses: {} })
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
  const [excelPreview, setExcelPreview] = useState([])
  const [excelFileName, setExcelFileName] = useState('')
  const [placeDraft, setPlaceDraft] = useState({ name: '', address: '', memo: '', googlePlaceId: '', googleMapsUrl: '', latitude: '', longitude: '' })
  const [schedulePlaceDraft, setSchedulePlaceDraft] = useState({ place: '', address: '' })
  const [scheduleAgentNote, setScheduleAgentNote] = useState('')
  const [scheduleAgentLoading, setScheduleAgentLoading] = useState(false)
  const [scheduleVoiceListening, setScheduleVoiceListening] = useState(false)
  const [completionSchedule, setCompletionSchedule] = useState(null)
  const [completionAmount, setCompletionAmount] = useState('0')
  const [receiptFile, setReceiptFile] = useState(null)
  const [receiptPreview, setReceiptPreview] = useState('')
  const [receiptStatus, setReceiptStatus] = useState('')
  const [tripCountry, setTripCountry] = useState('VN')
  const [tripCurrency, setTripCurrency] = useState('VND')
  const [tripStartDate, setTripStartDate] = useState('')
  const [tripEndDate, setTripEndDate] = useState('')
  const [exchangeRates, setExchangeRates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('travel-exchange-rates'))?.rates || null } catch { return null }
  })
  const excelInputRef = useRef(null)
  const scheduleFormRef = useRef(null)

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let active = true
    fetch('https://open.er-api.com/v6/latest/USD')
      .then((response) => {
        if (!response.ok) throw new Error('환율 요청 실패')
        return response.json()
      })
      .then((data) => {
        if (!active || !data.rates) return
        setExchangeRates(data.rates)
        localStorage.setItem('travel-exchange-rates', JSON.stringify({ rates: data.rates, updatedAt: Date.now() }))
      })
      .catch(() => {})
    return () => { active = false }
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
      const [tripsResult, schedulesResult, expensesResult] = await Promise.all([
        supabase.from('trips').select('id,owner_id,title,destination,start_date,end_date,people,currency').order('start_date', { ascending: true }),
        supabase.from('schedule_items').select('trip_id,title,place_name,memo,estimated_cost,actual_cost,completed,cost_category,payment_method,cost_currency'),
        supabase.from('expenses').select('trip_id,schedule_item_id,category,title,amount,currency,memo'),
      ])
      const { data, error } = tripsResult

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
        setTripBudgetItems({
          schedules: (schedulesResult.data || []).reduce((groups, item) => ({ ...groups, [item.trip_id]: [...(groups[item.trip_id] || []), item] }), {}),
          expenses: (expensesResult.data || []).reduce((groups, item) => ({ ...groups, [item.trip_id]: [...(groups[item.trip_id] || []), item] }), {}),
        })
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
          .select('id,day_date,start_time,title,place_name,address,memo,completed,estimated_cost,actual_cost,sort_order,reservation_status,reservation_site,reservation_reference,reservation_url,cost_category,payment_method,cost_currency')
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
          costCategory: item.cost_category,
          paymentMethod: item.payment_method,
          costCurrency: item.cost_currency,
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
      if (type === 'schedule') {
        setSchedulePlaceDraft({ place: '', address: '' })
        setScheduleAgentNote('')
      }
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
    if (type === 'schedule') {
      setSchedulePlaceDraft({ place: item.place || '', address: item.address || '' })
    }
    if (type === 'trip') {
      const country = COUNTRY_OPTIONS.find((option) => option[2] === item.currency)
      setTripCountry(country?.[0] || 'VN')
      setTripCurrency(item.currency || 'VND')
      setTripStartDate(item.startDate || '')
      setTripEndDate(item.endDate || item.startDate || '')
    }
    setDialog(`${type}-edit`)
  }

  const openTripDialog = () => {
    setTripMessage('')
    setTripCountry('VN')
    setTripCurrency('VND')
    setTripStartDate('')
    setTripEndDate('')
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
    const currency = String(form.get('currency') || 'VND')

    if (endDate < startDate) {
      setTripEndDate(startDate)
      setTripMessage('도착일은 출발일보다 빠를 수 없습니다. 날짜를 다시 확인해 주세요.')
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
        currency,
      }
    const query = editingItem?.type === 'trip'
      ? supabase.from('trips').update({ title, destination, start_date: startDate, end_date: endDate, people, currency }).eq('id', editingItem.item.id)
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

  const selectScheduleGooglePlace = useCallback((place) => {
    setSchedulePlaceDraft({ place: place.name || '', address: place.address || '' })
  }, [])

  const startScheduleVoiceInput = async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setItemMessage('이 기기에서는 앱 내 음성 인식을 지원하지 않습니다. 휴대폰 키보드의 마이크 버튼을 이용해 주세요.')
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setItemMessage('이 환경에서는 마이크 권한을 요청할 수 없습니다. Chrome 또는 설치된 앱에서 다시 시도해 주세요.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
    } catch (error) {
      const denied = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError'
      setItemMessage(denied
        ? '마이크 권한이 차단되어 있습니다. 휴대폰 설정 → 앱 → 여행온 → 권한 → 마이크를 허용해 주세요.'
        : '마이크를 사용할 수 없습니다. 다른 앱에서 마이크를 사용 중인지 확인해 주세요.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'ko-KR'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onstart = () => { setScheduleVoiceListening(true); setItemMessage('') }
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || ''
      setScheduleAgentNote((current) => `${current}${current ? ' ' : ''}${transcript}`)
    }
    recognition.onerror = (event) => {
      const messages = {
        'not-allowed': '마이크 권한이 차단되어 있습니다. 휴대폰 설정에서 여행온의 마이크 권한을 허용해 주세요.',
        'audio-capture': '마이크를 찾지 못했습니다. 기기의 마이크 상태를 확인해 주세요.',
        'no-speech': '음성이 들리지 않았습니다. 마이크 가까이에서 다시 말해 주세요.',
        network: '음성 인식 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.',
        aborted: '음성 입력이 취소되었습니다.',
      }
      setItemMessage(messages[event.error] || `음성 인식 오류가 발생했습니다. (${event.error || '알 수 없음'})`)
    }
    recognition.onend = () => setScheduleVoiceListening(false)
    try {
      recognition.start()
    } catch {
      setScheduleVoiceListening(false)
      setItemMessage('음성 인식을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    }
  }

  const analyzeScheduleAgentNote = async () => {
    if (!scheduleAgentNote.trim() || !selectedTrip || !supabase) {
      setItemMessage('만들고 싶은 일정을 말하거나 글로 입력해 주세요.')
      return
    }
    setScheduleAgentLoading(true)
    setItemMessage('AI가 일정 내용을 정리하고 있습니다...')
    try {
      const { data, error } = await supabase.functions.invoke('analyze-schedule-draft', {
        body: {
          note: scheduleAgentNote,
          selectedDate: editingItem?.item.date || selectedScheduleDate || selectedTrip.startDate,
          trip: {
            title: selectedTrip.title,
            destination: selectedTrip.destination,
            startDate: selectedTrip.startDate,
            endDate: selectedTrip.endDate,
            currency: selectedTrip.currency || 'VND',
          },
        },
      })
      if (error) {
        let message = error.message
        if (error.context instanceof Response) {
          const details = await error.context.json().catch(() => null)
          if (details?.error) message = details.error
        }
        throw new Error(message)
      }
      const draft = data?.draft
      const form = scheduleFormRef.current
      if (!draft || !form) throw new Error('일정 초안을 받지 못했습니다.')
      const values = {
        title: draft.title,
        date: draft.day_date,
        time: draft.start_time || '',
        memo: draft.memo || '',
        estimatedCost: draft.estimated_cost || 0,
        costCategory: draft.cost_category,
        paymentMethod: draft.payment_method,
        costCurrency: draft.cost_currency,
        reservationStatus: draft.reservation_status,
        reservationSite: draft.reservation_site || '',
        reservationReference: draft.reservation_reference || '',
        reservationUrl: draft.reservation_url || '',
      }
      Object.entries(values).forEach(([name, value]) => {
        const field = form.elements.namedItem(name)
        if (field) field.value = value
      })
      setSchedulePlaceDraft({ place: draft.place_name || '', address: draft.address_candidate || '' })
      const quotaText = data?.quota ? ` · 오늘 ${data.quota.remaining}회 남음` : ''
      setItemMessage(draft.warnings?.length
        ? `입력 가능한 항목을 먼저 채웠습니다. 저장 전 확인: ${draft.warnings.join(' · ')}${quotaText}`
        : `AI가 입력 가능한 항목을 모두 채웠습니다. 내용을 확인하고 저장해 주세요.${quotaText}`)
    } catch (error) {
      setItemMessage(`AI 일정 분석 실패: ${error.message}`)
    } finally {
      setScheduleAgentLoading(false)
    }
  }

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
        cost_category: String(form.get('costCategory') || 'other'),
        payment_method: String(form.get('paymentMethod') || 'either'),
        cost_currency: String(form.get('costCurrency') || selectedTrip?.currency || 'VND'),
      }
    const query = editingItem?.type === 'schedule'
      ? supabase.from('schedule_items').update(values).eq('id', editingItem.item.id).eq('trip_id', selectedTripId)
      : supabase.from('schedule_items').insert({ ...values, trip_id: selectedTripId, created_by: session.user.id })
    const { data, error } = await query
      .select('id,day_date,start_time,title,place_name,address,memo,completed,estimated_cost,actual_cost,reservation_status,reservation_site,reservation_reference,reservation_url,cost_category,payment_method,cost_currency')
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
      costCategory: data.cost_category,
      paymentMethod: data.payment_method,
      costCurrency: data.cost_currency,
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
    const paymentMethod = String(form.get('paymentMethod') || '')
    const memoText = String(form.get('memo')).replace(/^결제수단:\s*(현금|카드)\s*·?\s*/, '').trim()
    const values = {
      schedule_item_id: String(form.get('scheduleItemId')) || null,
      category: String(form.get('category')),
      title: String(form.get('title')).trim(),
      amount: Number(form.get('amount')),
      currency: String(form.get('currency')),
      spent_at: new Date(String(form.get('spentAt'))).toISOString(),
      memo: [paymentMethod && `결제수단: ${paymentMethod}`, memoText].filter(Boolean).join(' · ') || null,
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

  const openScheduleCompletion = (schedule) => {
    setCompletionSchedule(schedule)
    setCompletionAmount(String(schedule.actualCost || schedule.estimatedCost || 0))
    setReceiptFile(null)
    setReceiptPreview('')
    setReceiptStatus('')
    setItemMessage('')
    setDialog('schedule-complete')
  }

  const readReceipt = async (file) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setReceiptStatus('JPG, PNG 또는 WebP 영수증 사진을 선택해 주세요.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setReceiptStatus('영수증 사진은 10MB 이하만 저장할 수 있습니다.')
      return
    }
    setReceiptFile(file)
    setReceiptPreview(URL.createObjectURL(file))
    setReceiptStatus('영수증을 읽고 있습니다…')
    if (!Capacitor.isNativePlatform()) {
      setReceiptStatus('웹에서는 사진을 저장할 수 있습니다. 자동 금액 인식은 최신 Android 앱에서 지원합니다.')
      return
    }
    try {
      const dataUrl = await fileToDataUrl(file)
      const result = await ReceiptOcr.recognize({ dataUrl })
      const detectedAmount = findReceiptAmount(result.text)
      if (detectedAmount > 0) {
        setCompletionAmount(String(detectedAmount))
        setReceiptStatus(`영수증에서 ${detectedAmount.toLocaleString('ko-KR')}을 찾았습니다. 금액을 확인해 주세요.`)
      } else {
        setReceiptStatus('글자는 읽었지만 총액을 확정하지 못했습니다. 실제 금액을 직접 확인해 주세요.')
      }
    } catch (error) {
      setReceiptStatus(error?.message || '영수증을 자동으로 읽지 못했습니다. 금액을 직접 입력해 주세요.')
    }
  }

  const saveScheduleCompletion = async (event) => {
    event.preventDefault()
    const schedule = completionSchedule
    if (!session || !selectedTripId || !supabase || itemLoading) return
    const actualCost = Number(String(completionAmount).replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(actualCost) || actualCost < 0) {
      setReceiptStatus('완료 금액을 올바르게 입력해 주세요.')
      return
    }
    setItemLoading(true)
    setItemMessage('')
    const { data, error } = await supabase
      .from('schedule_items')
      .update({ completed: true, actual_cost: actualCost, updated_at: new Date().toISOString() })
      .eq('id', schedule.id)
      .eq('trip_id', selectedTripId)
      .select('completed,actual_cost')
      .single()
    if (error) {
      setItemLoading(false)
      setReceiptStatus(`완료 상태를 변경하지 못했습니다: ${error.message}`)
      return
    }

    let receiptWarning = ''
    if (receiptFile) {
      const extension = receiptFile.type === 'image/png' ? 'png' : receiptFile.type === 'image/webp' ? 'webp' : 'jpg'
      const storagePath = `${selectedTripId}/receipts/${schedule.id}-${Date.now()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('trip-files').upload(storagePath, receiptFile, { contentType: receiptFile.type, upsert: false })
      if (uploadError) {
        receiptWarning = ` 영수증 사진 저장 실패: ${uploadError.message}`
      } else {
        const { error: attachmentError } = await supabase.from('attachments').insert({
          trip_id: selectedTripId,
          schedule_item_id: schedule.id,
          uploaded_by: session.user.id,
          storage_path: storagePath,
          kind: 'receipt',
        })
        if (attachmentError) receiptWarning = ` 영수증 정보 저장 실패: ${attachmentError.message}`
      }
    }
    setSchedules((current) => current.map((item) => item.id === schedule.id ? {
      ...item,
      completed: data.completed,
      actualCost: Number(data.actual_cost),
    } : item))
    setItemLoading(false)
    setDialog(null)
    setCompletionSchedule(null)
    setItemMessage(`완료 처리했습니다. 실제 금액 ${formatMoney(Number(data.actual_cost), schedule.costCurrency || selectedTrip?.currency || 'VND')}.${receiptFile && !receiptWarning ? ' 영수증 사진도 저장했습니다.' : ''}${receiptWarning}`)
  }

  const toggleSchedule = async (schedule) => {
    if (!schedule.completed) {
      openScheduleCompletion(schedule)
      return
    }
    if (!session || !selectedTripId || !supabase || itemLoading) return
    setItemLoading(true)
    setItemMessage('')
    const { data, error } = await supabase.from('schedule_items')
      .update({ completed: false, updated_at: new Date().toISOString() })
      .eq('id', schedule.id).eq('trip_id', selectedTripId).select('completed,actual_cost').single()
    setItemLoading(false)
    if (error) {
      setItemMessage(`완료 상태를 변경하지 못했습니다: ${error.message}`)
      return
    }
    setSchedules((current) => current.map((item) => item.id === schedule.id ? { ...item, completed: data.completed, actualCost: Number(data.actual_cost) } : item))
    setItemMessage('완료를 취소했습니다.')
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
    if (!file) return
    if (!selectedTrip || !session || !canEditTrip) {
      setItemMessage('이 여행의 일정을 편집할 권한이 없습니다.')
      return
    }
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setItemMessage('Excel .xlsx 파일을 선택해 주세요.')
      return
    }
    setItemLoading(true)
    setItemMessage(`${file.name} 파일을 확인하고 있습니다...`)
    try {
      let rows
      let analysisWarnings = []
      let aiQuota = null
      try {
        rows = await readScheduleWorkbook(file, selectedTrip)
      } catch (templateError) {
        setItemMessage('여행온 양식과 다른 Excel입니다. AI가 내용을 정리하고 있습니다...')
        const sheets = await readWorkbookForAi(file)
        const { data, error } = await supabase.functions.invoke('analyze-trip-excel', {
          body: {
            trip: {
              title: selectedTrip.title,
              destination: selectedTrip.destination,
              startDate: selectedTrip.startDate,
              endDate: selectedTrip.endDate,
              currency: selectedTrip.currency || 'VND',
            },
            sheets,
          },
        })
        if (error) {
          let message = error.message
          if (error.context instanceof Response) {
            const details = await error.context.json().catch(() => null)
            if (details?.error) message = details.error
          }
          throw new Error(`${message} (양식 확인: ${templateError.message})`)
        }
        rows = data?.items || []
        analysisWarnings = data?.warnings || []
        aiQuota = data?.quota || null
      }
      setExcelPreview(rows)
      setExcelFileName(file.name)
      setDialog('excel-preview')
      const quotaText = aiQuota ? `오늘 AI ${aiQuota.remaining}회 남음` : ''
      setItemMessage(analysisWarnings.length ? `AI 확인사항: ${analysisWarnings.join(' · ')}${quotaText ? ` · ${quotaText}` : ''}` : quotaText)
    } catch (error) {
      setItemMessage(`Excel 분석 실패: ${error.message}`)
    } finally {
      setItemLoading(false)
    }
  }

  const updateExcelPreview = (index, field, value) => {
    setExcelPreview((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row))
  }

  const confirmExcelImport = async () => {
    if (!selectedTrip || !session || !excelPreview.length) return
    setItemLoading(true)
    setItemMessage('분석한 일정을 저장하고 있습니다...')
    try {
      const { data, error } = await supabase
        .from('schedule_items')
        .insert(excelPreview.map((row, index) => ({
          ...row,
          estimated_cost: Number(row.estimated_cost || 0),
          trip_id: selectedTrip.id,
          created_by: session.user.id,
          sort_order: schedules.length + index,
        })))
        .select('id,day_date,start_time,title,place_name,address,memo,completed,estimated_cost,actual_cost,reservation_status,reservation_site,reservation_reference,reservation_url,cost_category,payment_method,cost_currency')
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
        costCategory: item.cost_category,
        paymentMethod: item.payment_method,
        costCurrency: item.cost_currency,
      }))
      setSchedules((current) => [...current, ...imported].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)))
      setItemMessage(`${imported.length}개의 일정을 Excel에서 가져왔습니다.`)
      setExcelPreview([])
      setExcelFileName('')
      setDialog(null)
    } catch (error) {
      setItemMessage(`Excel 업로드 실패: ${error.message}`)
    } finally {
      setItemLoading(false)
    }
  }

  const downloadExcelTemplate = async () => {
    if (!selectedTrip) return
    setItemLoading(true)
    setItemMessage('Excel 양식을 만들고 있습니다...')
    try {
      await downloadScheduleTemplate(selectedTrip)
      setItemMessage('Excel 양식을 열거나 저장해 주세요. 작성 후 이 화면에서 업로드하면 됩니다.')
    } catch (error) {
      setItemMessage(`Excel 양식 다운로드 실패: ${error.message}`)
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
        const date = addDaysToDateText(selectedTrip.startDate, dayIndex)

        daySection.querySelectorAll('.schedule-item').forEach((item, sortOrder) => {
          const rawTime = item.querySelector('.time')?.textContent.trim() || ''
          const time = /^\d{1,2}:\d{2}$/.test(rawTime) ? rawTime.padStart(5, '0') : null
          const title = item.querySelector('.card-title')?.textContent.trim()
          if (!title || existingKeys.has(`${date}|${time || ''}|${title}`)) return
          const category = item.querySelector('.card-category')?.textContent.trim() || ''
          const priceText = item.querySelector('.price-tag')?.textContent.trim() || ''
          const mapUrl = item.querySelector('.map-btn')?.href || ''
          const cardText = item.querySelector('.card')?.textContent.replace(/\s+/g, ' ').trim() || ''
          const legacyPrice = parseLegacyPrice(priceText)
          const paymentMethod = item.querySelector('.pay-badge.cash') ? 'cash' : item.querySelector('.pay-badge.card') ? 'card' : item.querySelector('.pay-badge.done') ? 'prepaid' : 'either'
          const memoParts = [category, rawTime && !time ? `시간: ${rawTime}` : '', cardText, mapUrl ? `지도: ${mapUrl}` : ''].filter(Boolean)

          rows.push({
            trip_id: selectedTrip.id,
            day_date: date,
            start_time: time,
            title,
            memo: memoParts.join(' · ').slice(0, 1800),
            estimated_cost: legacyPrice.amount,
            actual_cost: 0,
            cost_category: classifyLegacyCost(category, title),
            payment_method: paymentMethod,
            cost_currency: legacyPrice.currency,
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
        .select('id,day_date,start_time,title,place_name,address,memo,completed,estimated_cost,actual_cost,reservation_status,reservation_site,reservation_reference,reservation_url,cost_category,payment_method,cost_currency')
      if (error) throw error
      const imported = data.map((item) => ({
        id: item.id, date: item.day_date, time: item.start_time?.slice(0, 5) || '', title: item.title,
        place: item.place_name, address: item.address, memo: item.memo, completed: item.completed,
        estimatedCost: Number(item.estimated_cost), actualCost: Number(item.actual_cost),
        reservationStatus: item.reservation_status, reservationSite: item.reservation_site,
        reservationReference: item.reservation_reference, reservationUrl: item.reservation_url,
        costCategory: item.cost_category, paymentMethod: item.payment_method, costCurrency: item.cost_currency,
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
        const date = addDaysToDateText(tripData.start_date, dayIndex)

        daySection.querySelectorAll('.schedule-item').forEach((item, sortOrder) => {
          const rawTime = item.querySelector('.time')?.textContent.trim() || ''
          const time = /^\d{1,2}:\d{2}$/.test(rawTime) ? rawTime.padStart(5, '0') : null
          const title = item.querySelector('.card-title')?.textContent.trim()
          if (!title || existingKeys.has(`${date}|${time || ''}|${title}`)) return
          const category = item.querySelector('.card-category')?.textContent.trim() || ''
          const priceText = item.querySelector('.price-tag')?.textContent.trim() || ''
          const mapUrl = item.querySelector('.map-btn')?.href || ''
          const cardText = item.querySelector('.card')?.textContent.replace(/\s+/g, ' ').trim() || ''
          const legacyPrice = parseLegacyPrice(priceText)
          const paymentMethod = item.querySelector('.pay-badge.cash') ? 'cash' : item.querySelector('.pay-badge.card') ? 'card' : item.querySelector('.pay-badge.done') ? 'prepaid' : 'either'
          const memoParts = [category, rawTime && !time ? `시간: ${rawTime}` : '', cardText, mapUrl ? `지도: ${mapUrl}` : ''].filter(Boolean)
          rows.push({
            trip_id: tripData.id,
            day_date: date,
            start_time: time,
            title,
            memo: memoParts.join(' · ').slice(0, 1800),
            estimated_cost: legacyPrice.amount,
            actual_cost: 0,
            cost_category: classifyLegacyCost(category, title),
            payment_method: paymentMethod,
            cost_currency: legacyPrice.currency,
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
    <div className={`app-shell ${isTripDetail ? 'hanoi-detail-theme' : ''}`}>
      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">{isTripDetail ? getTripPhaseLabel(selectedTrip) : screen === 'settings' ? '개인정보와 비용을 지켜요' : screen === 'community' ? '여행자가 여행자를 도와요' : '안녕하세요 👋'}</p>
            {!isTripDetail && <h1>{screen === 'settings' ? '설정' : screen === 'community' ? '여행온 이야기' : '어디로 떠나볼까요?'}</h1>}
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

        {screen === 'settings' && session && <PersonalAiSettings />}

        {screen === 'community' && session && (
          <section className="community-coming-soon">
            <span aria-hidden="true">🌏</span>
            <h2>여행온 게시판</h2>
            <p>한국인 여행자들이 직접 확인한 장소, 비용, 이동 팁을 안전하게 나누는 공간을 준비하고 있습니다.</p>
            <div><strong>운영 원칙</strong><ul><li>광고성·허위 정보보다 실제 여행 경험을 우선합니다.</li><li>개인정보와 예약번호는 자동으로 숨길 수 있게 만듭니다.</li><li>신고·차단·관리 기능을 갖춘 뒤 글쓰기를 엽니다.</li></ul></div>
          </section>
        )}

        {isTripDetail && setupTripId === selectedTripId && (
          <section className="excel-section" aria-labelledby="excel-title">
            <div><p className="section-label">Excel 일정 관리</p><h2 id="excel-title">양식으로 한 번에 만들기</h2></div>
            <p>양식을 내려받아 일정을 입력한 뒤 그대로 업로드하세요. 예약 사이트와 예약 링크도 함께 등록됩니다.</p>
            <div className="excel-actions">
              <button type="button" onClick={downloadExcelTemplate} disabled={itemLoading}>양식 다운로드</button>
              <button type="button" onClick={() => exportTripSchedule(selectedTrip, schedules)} disabled={!schedules.length}>현재 일정 내보내기</button>
              {canEditTrip && <label className={`excel-upload-label primary${itemLoading ? ' is-disabled' : ''}`} htmlFor="schedule-excel-upload">Excel 업로드</label>}
              {isTripOwner && selectedTrip.destination.includes('하노이') && <button type="button" onClick={importLegacyHanoiSchedule} disabled={itemLoading}>기존 하노이 일정 가져오기</button>}
            </div>
            <input id="schedule-excel-upload" ref={excelInputRef} className="visually-hidden" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream" onChange={importScheduleExcel} disabled={itemLoading} />
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

        {isTripDetail && (
          <section className="saved-section">
            <div className="section-heading">
              <div><p className="section-label">{selectedTrip?.title} · 일정</p><h2>여행 일정</h2></div>
              <div className="section-heading-actions">
                <button
                  className="mini-add secondary"
                  type="button"
                  aria-expanded={setupTripId === selectedTripId}
                  onClick={() => {
                    const willOpen = setupTripId !== selectedTripId
                    setSetupTripId(willOpen ? selectedTripId : null)
                    if (willOpen) setTimeout(() => document.getElementById('excel-title')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
                  }}
                >{setupTripId === selectedTripId ? 'Excel 닫기' : 'Excel 관리'}</button>
                {canEditTrip && <button className="mini-add" type="button" onClick={() => openItemDialog('schedule')}>＋ 일정 추가</button>}
              </div>
            </div>
            {schedules.length > 0 ? <>
              <div className="schedule-day-tabs" role="tablist" aria-label="여행 날짜 선택">
              {scheduleDates.map((date, index) => {
                const dateValue = parseCalendarDate(date)
                const hanoiLabels = ['도착', '미딩', '올드쿼터', '귀국']
                const subtitle = selectedTrip.title.includes('하노이') ? hanoiLabels[index] : `${index + 1}일차`
                return <button className={activeScheduleDate === date ? 'is-active' : ''} type="button" role="tab" aria-selected={activeScheduleDate === date} onClick={() => setSelectedScheduleDate(date)} key={date}><strong>{dateValue.getDate()}</strong><small>{new Intl.DateTimeFormat('ko-KR', { weekday: 'short' }).format(dateValue)} · {subtitle}</small></button>
              })}
              </div>
              <div className="saved-list">{visibleSchedules.map((schedule) => (
              <div className={`saved-trip schedule-row ${schedule.completed ? 'is-completed' : ''}`} key={schedule.id}>
                <span className="schedule-date"><strong>{schedule.time || '일정'}</strong><small>{schedule.time ? '시간' : schedule.date.slice(5)}</small></span>
                <span><strong>{schedule.title}</strong><small>{schedule.place || schedule.memo || '세부 내용 없음'}</small>{(schedule.actualCost > 0 || schedule.estimatedCost > 0) && <small className="schedule-cost">{schedule.completed ? '실제' : '예상'} {formatMoney(schedule.completed ? schedule.actualCost : schedule.estimatedCost, schedule.costCurrency || selectedTrip?.currency || 'VND')}</small>}{schedule.reservationStatus !== 'none' && <em className={`reservation-badge is-${schedule.reservationStatus}`}>{schedule.reservationStatus === 'booked' ? '예약 완료' : schedule.reservationStatus === 'planned' ? '예약 예정' : '취소됨'}</em>}</span>
                <div className="item-actions">
                  <a href={getScheduleMapUrl(schedule, selectedTrip)} target="_blank" rel="noreferrer">📍 지도</a>
                  <button type="button" onClick={() => openGrabForSchedule(schedule, selectedTrip)}>🚕 Grab</button>
                  {canEditTrip && <>
                  <button type="button" onClick={() => toggleSchedule(schedule)} disabled={itemLoading}>{schedule.completed ? '완료 취소' : '완료'}</button>
                  <button type="button" onClick={() => openEditDialog('schedule', schedule)}>수정</button>
                  <button className="danger" type="button" onClick={() => deleteItem('schedule', schedule)}>삭제</button>
                  </>}
                </div>
                {(schedule.reservationSite || schedule.reservationReference || schedule.reservationUrl) && <div className="reservation-link">{schedule.reservationUrl ? <a href={schedule.reservationUrl} target="_blank" rel="noreferrer">{schedule.reservationSite || '예약 사이트'} 열기</a> : <strong>{schedule.reservationSite || '예약 정보'}</strong>}{schedule.reservationReference && <span>예약번호 {schedule.reservationReference}</span>}</div>}
              </div>
              ))}</div>
            </> : <div className="schedule-empty"><span aria-hidden="true">🗓️</span><strong>아직 등록된 일정이 없어요</strong><p>날짜와 시간을 선택해 첫 일정을 만들어 보세요.</p>{canEditTrip && <button type="button" onClick={() => openItemDialog('schedule')}>첫 일정 추가</button>}</div>}
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
                <div className="trip-budget-summary" aria-label={`${trip.title} 예산 요약`}>
                  {buildTripBudgetSummary(
                    trip,
                    trip.id === selectedTripId ? schedules : tripBudgetItems.schedules[trip.id],
                    trip.id === selectedTripId ? expenses : tripBudgetItems.expenses[trip.id],
                    exchangeRates,
                  ).map((budget) => <span className={budget.totals ? 'is-total' : ''} key={budget.label}><small>{budget.label}</small>{budget.totals ? <><strong>{formatMoney(budget.convertedTotal, budget.currency)}</strong><em>{budget.canConvert ? '입력 통화 환산 · KRW' : budget.totals.length > 1 ? '환율 불러오는 중' : '사용 합계'}</em></> : <><strong>{budget.amounts.length ? budget.amounts.map(([currency, amount]) => formatMoney(amount, currency)).join(' + ') : formatMoney(0, budget.fallbackCurrency)}</strong><em>{budget.prepaid ? '선결제 금액' : `사용 ${budget.actuals.length ? budget.actuals.map(([currency, amount]) => formatMoney(amount, currency)).join(' + ') : formatMoney(0, budget.amounts[0]?.[0] || budget.fallbackCurrency)}`}</em></>}</span>)}
                </div>
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
        {isTripDetail && canEditTrip && <button className="schedule-fab" type="button" onClick={() => openItemDialog('schedule')} aria-label="새 일정 추가"><span aria-hidden="true">＋</span><b>일정</b></button>}
      </main>

      {session && <BottomNav activeScreen={screen === 'trip' ? 'home' : screen} onNavigate={(nextScreen) => { setSetupTripId(null); setScreen(nextScreen) }} />}

      {dialog && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}>
          <section className={`app-dialog${dialog === 'excel-preview' ? ' excel-preview-dialog' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <div className="dialog-handle" />
            <div className="dialog-heading"><div><p className="section-label">{dialog === 'auth' ? '여행온 계정' : dialog === 'excel-preview' ? 'Excel 자동 분석' : dialog === 'schedule-complete' ? '일정 마무리' : '새로운 기록'}</p><h2 id="dialog-title">{dialog === 'trip' ? '새 여행 만들기' : dialog === 'trip-edit' ? '여행 수정' : dialog === 'schedule' ? '새 일정 만들기' : dialog === 'schedule-edit' ? '일정 수정' : dialog === 'schedule-complete' ? '완료 및 영수증 저장' : dialog === 'place-edit' ? '장소 수정' : dialog === 'expense' ? '경비 기록' : dialog === 'expense-edit' ? '경비 수정' : dialog === 'share' ? '여행 공유' : dialog === 'excel-preview' ? '분석 결과 확인' : dialog === 'auth' ? '로그인' : '장소 저장'}</h2></div><button type="button" onClick={() => { setDialog(null); setEditingItem(null); setCompletionSchedule(null) }} aria-label="닫기">×</button></div>
            {dialog === 'excel-preview' ? (
              <div className="excel-preview-panel">
                <p><strong>{excelFileName}</strong>에서 {excelPreview.length}개 일정을 찾았습니다. 잘못 분류된 내용은 여기서 고친 뒤 저장하세요.</p>
                <div className="excel-preview-list">{excelPreview.map((row, index) => (
                  <article className="excel-preview-row" key={`${row.day_date}-${row.start_time}-${index}`}>
                    <div className="excel-preview-title"><strong>{row.day_date} {row.start_time} · {row.title}</strong><button type="button" onClick={() => setExcelPreview((current) => current.filter((_, rowIndex) => rowIndex !== index))}>삭제</button></div>
                    <div className="form-row"><label>비용 분류<select value={row.cost_category} onChange={(event) => updateExcelPreview(index, 'cost_category', event.target.value)}><option value="flight">항공</option><option value="accommodation">숙소</option><option value="food">식비</option><option value="transport">교통</option><option value="activity">관광·체험</option><option value="shopping">쇼핑</option><option value="other">기타</option></select></label><label>결제 구분<select value={row.payment_method} onChange={(event) => updateExcelPreview(index, 'payment_method', event.target.value)}><option value="cash">현금</option><option value="card">카드</option><option value="prepaid">선결제</option></select></label></div>
                    <div className="form-row"><label>예상 비용<input type="number" min="0" inputMode="decimal" value={row.estimated_cost} onChange={(event) => updateExcelPreview(index, 'estimated_cost', event.target.value)} /></label><label>통화<select value={row.cost_currency} onChange={(event) => updateExcelPreview(index, 'cost_currency', event.target.value)}>{CURRENCY_OPTIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label></div>
                  </article>
                ))}</div>
                {itemMessage && <p className="auth-message" role="alert">{itemMessage}</p>}
                <button className="dialog-submit" type="button" onClick={confirmExcelImport} disabled={itemLoading || !excelPreview.length}>{itemLoading ? '저장 중…' : `${excelPreview.length}개 일정 저장`}</button>
              </div>
            ) : dialog === 'schedule-complete' ? (
              <form onSubmit={saveScheduleCompletion}>
                <div className="completion-summary">
                  <span aria-hidden="true">✅</span>
                  <div><strong>{completionSchedule?.title}</strong><small>{completionSchedule?.date} {completionSchedule?.time || ''}</small></div>
                </div>
                <label>실제 사용금액
                  <input type="text" inputMode="decimal" value={Number(completionAmount || 0).toLocaleString('ko-KR')} onChange={(event) => setCompletionAmount(event.target.value.replace(/[^0-9.]/g, ''))} />
                  <small>{completionSchedule?.costCurrency || selectedTrip?.currency || 'VND'} 기준 · 영수증 인식 후에도 꼭 확인해 주세요.</small>
                </label>
                <label className="receipt-capture">
                  <span>📷 영수증 촬영 또는 사진 선택</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => readReceipt(event.target.files?.[0])} />
                </label>
                {receiptPreview && <img className="receipt-preview" src={receiptPreview} alt="선택한 영수증 미리보기" />}
                {receiptStatus && <p className="auth-message" role="status">{receiptStatus}</p>}
                <div className="dialog-actions">
                  <button type="button" onClick={() => { setDialog(null); setCompletionSchedule(null) }}>취소</button>
                  <button className="dialog-submit" type="submit" disabled={itemLoading}>{itemLoading ? '저장 중…' : '금액 확인 및 완료'}</button>
                </div>
              </form>
            ) : dialog === 'auth' ? (
              <AuthPanel session={session} onClose={() => setDialog(null)} />
            ) : dialog === 'trip' || dialog === 'trip-edit' ? (
              <form onSubmit={saveTrip}>
                <div className="form-row">
                  <label>국가<select name="country" value={tripCountry} onChange={(event) => { const next = COUNTRY_OPTIONS.find((option) => option[0] === event.target.value); setTripCountry(event.target.value); setTripCurrency(next?.[2] || 'USD') }}>{COUNTRY_OPTIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
                  <label>기본 통화<select name="currency" value={tripCurrency} onChange={(event) => setTripCurrency(event.target.value)}>{CURRENCY_OPTIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
                </div>
                <label>여행 이름<input name="title" required placeholder="예: 도쿄 가족 여행" defaultValue={editingItem?.item.title || ''} /></label>
                <label>여행지<input name="destination" required placeholder="예: 도쿄" defaultValue={editingItem?.item.destination || ''} /></label>
                <div className="form-row"><label>출발일<input name="startDate" type="date" required value={tripStartDate} onChange={(event) => { const nextStart = event.target.value; setTripStartDate(nextStart); if (!tripEndDate) { setTripEndDate(nextStart); setTripMessage('') } else if (tripEndDate < nextStart) { setTripEndDate(nextStart); setTripMessage('도착일은 출발일보다 빠를 수 없어 출발일과 같은 날짜로 변경했습니다.') } else { setTripMessage('') } }} /></label><label>도착일<input name="endDate" type="date" required min={tripStartDate || undefined} value={tripEndDate} onChange={(event) => { const nextEnd = event.target.value; if (tripStartDate && nextEnd < tripStartDate) { setTripEndDate(tripStartDate); setTripMessage('도착일은 출발일보다 빠를 수 없습니다.') } else { setTripEndDate(nextEnd); setTripMessage('') } }} /></label></div>
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
                  <label>통화<select name="currency" defaultValue={editingItem?.item.currency || selectedTrip?.currency || 'VND'}>{CURRENCY_OPTIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
                </div>
                <label>금액<input name="amount" type="number" inputMode="decimal" min="0" step="0.01" required placeholder="0" defaultValue={editingItem?.item.amount ?? ''} /></label>
                <label>결제 수단<select name="paymentMethod" defaultValue={editingItem?.item.memo?.match(/결제수단:\s*(현금|카드)/)?.[1] || ''}><option value="">선택 안 함</option><option value="현금">현금</option><option value="카드">현지 카드</option></select></label>
                <label>사용 일시<input name="spentAt" type="datetime-local" required defaultValue={toLocalDateTimeValue(editingItem?.item.spentAt)} /></label>
                <label>연결 일정<select name="scheduleItemId" defaultValue={editingItem?.item.scheduleItemId || ''}><option value="">일정과 연결하지 않음</option>{schedules.map((schedule) => <option value={schedule.id} key={schedule.id}>{schedule.date} {schedule.time} · {schedule.title}</option>)}</select></label>
                <label>메모<textarea name="memo" maxLength="300" placeholder="결제 수단이나 상세 내용을 기록하세요" defaultValue={editingItem?.item.memo || ''} /></label>
                {itemMessage && <p className="auth-message" role="alert">{itemMessage}</p>}
                <button className="dialog-submit" type="submit" disabled={itemLoading}>{itemLoading ? '저장 중…' : '경비 저장'}</button>
              </form>
            ) : dialog === 'schedule' || dialog === 'schedule-edit' ? (
              <form ref={scheduleFormRef} onSubmit={saveSchedule}>
                <section className="schedule-agent-box">
                  <div className="schedule-agent-heading"><span aria-hidden="true">✨</span><div><strong>AI 일정 도우미</strong><small>말하거나 한 문장으로 입력하면 아래 항목을 자동으로 채워요.</small></div></div>
                  <textarea value={scheduleAgentNote} onChange={(event) => setScheduleAgentNote(event.target.value)} placeholder="예: 9월 11일 오전 10시 롯데몰 방문, 점심 50만 동 카드 결제 예정" maxLength="3000" />
                  <div className="schedule-agent-actions">
                    <button type="button" className={scheduleVoiceListening ? 'is-listening' : ''} onClick={startScheduleVoiceInput} disabled={scheduleVoiceListening || scheduleAgentLoading}>{scheduleVoiceListening ? '듣는 중…' : '🎤 음성 입력'}</button>
                    <button type="button" className="primary" onClick={analyzeScheduleAgentNote} disabled={scheduleAgentLoading || !scheduleAgentNote.trim()}>{scheduleAgentLoading ? '정리 중…' : '✨ AI로 채우기'}</button>
                  </div>
                  {itemMessage && <p className="auth-message schedule-agent-message" role="status">{itemMessage}</p>}
                </section>
                <label>일정 이름<input name="title" required placeholder="예: 공항으로 출발" defaultValue={editingItem?.item.title || ''} /></label>
                <div className="form-row"><label>날짜<input name="date" type="date" min={selectedTrip?.startDate} max={selectedTrip?.endDate} defaultValue={editingItem?.item.date || selectedScheduleDate || selectedTrip?.startDate || ''} required /></label><label>시간<input name="time" type="time" defaultValue={editingItem?.item.time || ''} required /></label></div>
                <div className="schedule-map-search"><strong><span aria-hidden="true">📍</span> Google 지도에서 장소 찾기</strong><GooglePlaceSearch onSelect={selectScheduleGooglePlace} /></div>
                <label>장소<input name="place" placeholder="예: 인천국제공항" value={schedulePlaceDraft.place} onChange={(event) => setSchedulePlaceDraft((current) => ({ ...current, place: event.target.value }))} /></label>
                <label>주소<input name="address" placeholder="Google 지도에서 선택하면 자동 입력됩니다" value={schedulePlaceDraft.address} onChange={(event) => setSchedulePlaceDraft((current) => ({ ...current, address: event.target.value }))} /></label>
                <label>메모<textarea name="memo" maxLength="300" placeholder="준비물이나 세부 내용을 기록하세요" defaultValue={editingItem?.item.memo || ''} /></label>
                <div className="form-row"><label>비용 분류<select name="costCategory" defaultValue={editingItem?.item.costCategory || 'other'}><option value="flight">항공</option><option value="accommodation">숙소</option><option value="food">식비</option><option value="transport">교통</option><option value="activity">관광·체험</option><option value="shopping">쇼핑</option><option value="other">기타</option></select></label><label>결제 방법<select name="paymentMethod" defaultValue={editingItem?.item.paymentMethod || 'either'}><option value="cash">현금만</option><option value="card">카드 가능</option><option value="either">현금·카드 모두</option><option value="prepaid">예약·선결제</option></select></label></div>
                <div className="form-row"><label>예상 비용<input name="estimatedCost" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={editingItem?.item.estimatedCost || 0} /></label><label>통화<select name="costCurrency" defaultValue={editingItem?.item.costCurrency || selectedTrip?.currency || 'VND'}>{CURRENCY_OPTIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label></div>
                <div className="form-row"><label>예약 상태<select name="reservationStatus" defaultValue={editingItem?.item.reservationStatus || 'none'}><option value="none">예약 없음</option><option value="planned">예약 예정</option><option value="booked">예약 완료</option><option value="cancelled">취소됨</option></select></label><label>예약 사이트<input name="reservationSite" placeholder="예: Agoda, Klook" defaultValue={editingItem?.item.reservationSite || ''} /></label></div>
                <label>예약번호<input name="reservationReference" placeholder="예약번호 또는 티켓번호" defaultValue={editingItem?.item.reservationReference || ''} /></label>
                <label>예약 링크<input name="reservationUrl" type="url" placeholder="https://..." defaultValue={editingItem?.item.reservationUrl || ''} /></label>
                <div className="dialog-actions">
                  <button className="dialog-cancel" type="button" onClick={() => { setDialog(null); setEditingItem(null); setItemMessage('') }} disabled={itemLoading}>취소</button>
                  <button className="dialog-submit" type="submit" disabled={itemLoading}>{itemLoading ? '저장 중…' : '일정 저장'}</button>
                </div>
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
