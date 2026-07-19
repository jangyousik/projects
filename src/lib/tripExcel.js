const columns = [
  { header: '날짜*', key: 'date', width: 14 },
  { header: '시간*', key: 'time', width: 11 },
  { header: '일정명*', key: 'title', width: 28 },
  { header: '장소', key: 'place', width: 24 },
  { header: '주소', key: 'address', width: 36 },
  { header: '메모', key: 'memo', width: 36 },
  { header: '예상비용', key: 'estimatedCost', width: 14 },
  { header: '비용분류', key: 'costCategory', width: 16 },
  { header: '결제구분*', key: 'paymentMethod', width: 16 },
  { header: '통화', key: 'costCurrency', width: 10 },
  { header: '예약상태', key: 'reservationStatus', width: 14 },
  { header: '예약사이트', key: 'reservationSite', width: 20 },
  { header: '예약번호', key: 'reservationReference', width: 22 },
  { header: '예약링크', key: 'reservationUrl', width: 48 },
]

const costCategoryLabels = { flight: '항공', accommodation: '숙소', food: '식비', transport: '교통', activity: '관광·체험', shopping: '쇼핑', other: '기타' }
const costCategoryValues = Object.fromEntries(Object.entries(costCategoryLabels).flatMap(([key, label]) => [[key, key], [label, key]]))
const paymentMethodValues = {
  cash: 'cash', card: 'card', prepaid: 'prepaid', either: 'either',
  현금: 'cash', '현금만': 'cash', 카드: 'card', '카드 가능': 'card',
  선결제: 'prepaid', '예약·선결제': 'prepaid', '현금·카드 모두': 'either',
}
const currencyCodes = ['VND', 'KRW', 'USD', 'JPY', 'THB', 'SGD', 'EUR', 'GBP', 'CNY', 'TWD', 'PHP', 'MYR', 'IDR']
const allowedCurrencies = new Set(currencyCodes)

const reservationLabels = {
  none: '예약 없음',
  planned: '예약 예정',
  booked: '예약 완료',
  cancelled: '취소됨',
}

const reservationValues = {
  '': 'none',
  '예약 없음': 'none',
  '예약 예정': 'planned',
  '예약 완료': 'booked',
  '취소됨': 'cancelled',
  none: 'none',
  planned: 'planned',
  booked: 'booked',
  cancelled: 'cancelled',
}

const pad = (value) => String(value).padStart(2, '0')

const dateToText = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }
  if (typeof value === 'number') {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000))
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
  }
  const text = String(value || '').trim().replaceAll('.', '-').replaceAll('/', '-')
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  return match ? `${match[1]}-${pad(match[2])}-${pad(match[3])}` : text
}

const timeToText = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${pad(value.getHours())}:${pad(value.getMinutes())}`
  if (typeof value === 'number') {
    const minutes = Math.round(value * 24 * 60)
    return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`
  }
  const text = String(value || '').trim()
  const match = text.match(/^(\d{1,2}):(\d{2})/)
  return match ? `${pad(match[1])}:${match[2]}` : text
}

const cellText = (value) => {
  if (value && typeof value === 'object' && 'text' in value) return String(value.text || '').trim()
  if (value && typeof value === 'object' && 'result' in value) return String(value.result || '').trim()
  return String(value ?? '').trim()
}

const bufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
  }
  return btoa(binary)
}

const download = async (buffer, filename) => {
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({
      path: filename,
      data: bufferToBase64(buffer),
      directory: Directory.Cache,
    })
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache })
    await Share.share({ title: filename, dialogTitle: 'Excel 파일 저장 또는 공유', files: [uri] })
    return
  }
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const loadExcelJS = async () => (await import('exceljs')).default

const createWorkbook = async (trip) => {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '여행온'
  workbook.created = new Date()

  const guide = workbook.addWorksheet('사용방법')
  guide.columns = [{ width: 22 }, { width: 75 }]
  guide.addRows([
    ['여행 이름', trip.title],
    ['여행 기간', `${trip.startDate} ~ ${trip.endDate}`],
    ['입력 방법', '일정 시트의 2행부터 입력하세요. 별표(*) 열은 필수입니다.'],
    ['날짜', `YYYY-MM-DD 형식이며 ${trip.startDate}부터 ${trip.endDate} 사이여야 합니다.`],
    ['시간', 'HH:MM 형식으로 입력하세요. 예: 09:30'],
    ['비용분류', '항공 / 숙소 / 식비 / 교통 / 관광·체험 / 쇼핑 / 기타 중 하나를 선택하세요.'],
    ['결제구분', '각 일정마다 현금 / 카드 / 선결제 중 하나를 반드시 선택하세요.'],
    ['통화', 'VND / KRW / USD 중 하나를 선택하세요. 예상비용과 실제 사용금액에 동일하게 적용됩니다.'],
    ['예약상태', '예약 없음 / 예약 예정 / 예약 완료 / 취소됨 중 하나를 입력하세요.'],
    ['예약링크', 'https://로 시작하는 예약 상세 페이지 주소를 넣으면 앱에서 바로 열 수 있습니다.'],
    ['주의', '열 이름을 바꾸거나 삭제하지 마세요. 빈 행은 자동으로 무시합니다.'],
  ])
  guide.getColumn(1).font = { bold: true }

  const sheet = workbook.addWorksheet('일정')
  sheet.columns = columns
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6555D9' } }
  sheet.getRow(1).height = 24
  for (let row = 2; row <= 501; row += 1) {
    sheet.getCell(`H${row}`).dataValidation = { type: 'list', allowBlank: false, formulae: ['"항공,숙소,식비,교통,관광·체험,쇼핑,기타"'] }
    sheet.getCell(`I${row}`).dataValidation = { type: 'list', allowBlank: false, formulae: ['"현금,카드,선결제"'] }
    sheet.getCell(`J${row}`).dataValidation = { type: 'list', allowBlank: false, formulae: [`"${currencyCodes.join(',')}"`] }
    sheet.getCell(`K${row}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"예약 없음,예약 예정,예약 완료,취소됨"'],
    }
  }
  sheet.autoFilter = { from: 'A1', to: 'N1' }
  return { workbook, sheet }
}

export const downloadScheduleTemplate = async (trip) => {
  const { workbook, sheet } = await createWorkbook(trip)
  sheet.addRow({ date: trip.startDate, time: '09:00', title: '예시 일정(삭제 후 입력)', costCategory: '기타', paymentMethod: '현금', costCurrency: trip.currency || 'VND', reservationStatus: '예약 없음' })
  const buffer = await workbook.xlsx.writeBuffer()
  await download(buffer, `여행온_${trip.title}_일정양식.xlsx`)
}

export const exportTripSchedule = async (trip, schedules) => {
  const { workbook, sheet } = await createWorkbook(trip)
  schedules.forEach((item) => sheet.addRow({
    date: item.date,
    time: item.time,
    title: item.title,
    place: item.place,
    address: item.address,
    memo: item.memo,
    estimatedCost: item.estimatedCost || 0,
    costCategory: costCategoryLabels[item.costCategory] || '기타',
    paymentMethod: item.paymentMethod === 'cash' ? '현금' : item.paymentMethod === 'prepaid' ? '선결제' : '카드',
    costCurrency: item.costCurrency || trip.currency || 'VND',
    reservationStatus: reservationLabels[item.reservationStatus] || '예약 없음',
    reservationSite: item.reservationSite,
    reservationReference: item.reservationReference,
    reservationUrl: item.reservationUrl,
  }))
  const buffer = await workbook.xlsx.writeBuffer()
  await download(buffer, `여행온_${trip.title}_일정.xlsx`)
}

export const readScheduleWorkbook = async (file, trip) => {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const sheet = workbook.getWorksheet('일정') || workbook.worksheets[0]
  if (!sheet) throw new Error('읽을 수 있는 시트가 없습니다.')

  const rows = []
  const errors = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const date = dateToText(row.getCell(1).value)
    const time = timeToText(row.getCell(2).value)
    const title = cellText(row.getCell(3).value)
    if (!date && !time && !title) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push(`${rowNumber}행: 날짜를 YYYY-MM-DD로 입력해 주세요.`)
    else if (date < trip.startDate || date > trip.endDate) errors.push(`${rowNumber}행: 날짜가 여행 기간 밖입니다.`)
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.push(`${rowNumber}행: 시간을 HH:MM으로 입력해 주세요.`)
    if (!title) errors.push(`${rowNumber}행: 일정명이 비어 있습니다.`)
    const costCategoryText = cellText(row.getCell(8).value) || '기타'
    const paymentMethodText = cellText(row.getCell(9).value)
    const costCurrency = (cellText(row.getCell(10).value) || trip.currency || 'VND').toUpperCase()
    if (!(costCategoryText in costCategoryValues)) errors.push(`${rowNumber}행: 비용분류 값을 확인해 주세요.`)
    if (!(paymentMethodText in paymentMethodValues)) errors.push(`${rowNumber}행: 결제구분에서 현금, 카드, 선결제 중 하나를 선택해 주세요.`)
    if (!allowedCurrencies.has(costCurrency)) errors.push(`${rowNumber}행: 통화는 VND, KRW, USD 중 하나여야 합니다.`)
    const reservationText = cellText(row.getCell(11).value)
    if (!(reservationText in reservationValues)) errors.push(`${rowNumber}행: 예약상태 값을 확인해 주세요.`)
    const reservationUrl = cellText(row.getCell(14).value)
    if (reservationUrl && !/^https:\/\//i.test(reservationUrl)) errors.push(`${rowNumber}행: 예약링크는 https://로 시작해야 합니다.`)

    rows.push({
      day_date: date,
      start_time: time,
      title,
      place_name: cellText(row.getCell(4).value) || null,
      address: cellText(row.getCell(5).value) || null,
      memo: cellText(row.getCell(6).value) || null,
      estimated_cost: Number(row.getCell(7).value || 0),
      cost_category: costCategoryValues[costCategoryText] || 'other',
      payment_method: paymentMethodValues[paymentMethodText] || 'either',
      cost_currency: costCurrency,
      reservation_status: reservationValues[reservationText] || 'none',
      reservation_site: cellText(row.getCell(12).value) || null,
      reservation_reference: cellText(row.getCell(13).value) || null,
      reservation_url: reservationUrl || null,
    })
  })
  if (errors.length) throw new Error(errors.slice(0, 8).join('\n'))
  if (!rows.length) throw new Error('업로드할 일정이 없습니다. 예시 행을 수정하거나 새 행을 입력해 주세요.')
  return rows
}

export const readWorkbookForAi = async (file) => {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())

  const sheets = workbook.worksheets.slice(0, 8).map((sheet) => {
    const rows = []
    const maxRows = Math.min(sheet.actualRowCount || sheet.rowCount, 250)
    const maxColumns = Math.min(sheet.actualColumnCount || sheet.columnCount, 30)

    for (let rowNumber = 1; rowNumber <= maxRows; rowNumber += 1) {
      const row = sheet.getRow(rowNumber)
      const values = []
      for (let columnNumber = 1; columnNumber <= maxColumns; columnNumber += 1) {
        values.push(cellText(row.getCell(columnNumber).value).slice(0, 500))
      }
      while (values.length && !values.at(-1)) values.pop()
      if (values.some(Boolean)) rows.push(values)
    }

    return { name: sheet.name.slice(0, 80), rows }
  }).filter((sheet) => sheet.rows.length)

  if (!sheets.length) throw new Error('분석할 내용이 있는 시트를 찾지 못했습니다.')
  return sheets
}
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
