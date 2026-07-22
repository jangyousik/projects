import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] }

const scheduleSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'warnings'],
  properties: {
    items: {
      type: 'array',
      maxItems: 250,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'day_date', 'start_time', 'title', 'place_name', 'address', 'memo',
          'estimated_cost', 'cost_category', 'payment_method', 'cost_currency',
          'reservation_status', 'reservation_site', 'reservation_reference',
          'reservation_url', 'confidence', 'warnings',
        ],
        properties: {
          day_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          start_time: { anyOf: [{ type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }, { type: 'null' }] },
          title: { type: 'string', minLength: 1 },
          place_name: nullableString,
          address: nullableString,
          memo: nullableString,
          estimated_cost: { type: 'number', minimum: 0 },
          cost_category: { type: 'string', enum: ['flight', 'accommodation', 'food', 'transport', 'activity', 'shopping', 'other'] },
          payment_method: { type: 'string', enum: ['cash', 'card', 'prepaid'] },
          cost_currency: { type: 'string', enum: ['VND', 'KRW', 'USD', 'JPY', 'THB', 'SGD', 'EUR', 'GBP', 'CNY', 'TWD', 'PHP', 'MYR', 'IDR'] },
          reservation_status: { type: 'string', enum: ['none', 'planned', 'booked', 'cancelled'] },
          reservation_site: nullableString,
          reservation_reference: nullableString,
          reservation_url: nullableString,
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          warnings: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
}

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'POST 요청만 지원합니다.' }, 405)

  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization) return jsonResponse({ error: '로그인이 필요합니다.' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const openAiKey = Deno.env.get('OPENAI_API_KEY')
    if (!supabaseUrl || !supabaseAnonKey || !openAiKey) return jsonResponse({ error: '서버 설정이 완료되지 않았습니다.' }, 500)

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    })
    const { data: { user }, error: userError } = await supabase.auth.getUser(authorization.replace(/^Bearer\s+/i, ''))
    if (userError || !user) return jsonResponse({ error: '로그인 세션을 확인할 수 없습니다.' }, 401)

    const body = await request.json()
    const trip = body?.trip
    const sheets = body?.sheets
    if (!trip?.startDate || !trip?.endDate || !Array.isArray(sheets) || !sheets.length) {
      return jsonResponse({ error: '여행 정보 또는 Excel 데이터가 올바르지 않습니다.' }, 400)
    }

    const compactSheets = sheets.slice(0, 8).map((sheet: { name?: unknown; rows?: unknown }) => ({
      name: String(sheet?.name || '').slice(0, 80),
      rows: Array.isArray(sheet?.rows) ? sheet.rows.slice(0, 250) : [],
    }))
    const serializedSheets = JSON.stringify(compactSheets)
    if (serializedSheets.length > 350_000) return jsonResponse({ error: 'Excel 내용이 너무 큽니다. 250행 이하로 나누어 주세요.' }, 413)

    const { data: quota, error: quotaError } = await supabase.rpc('consume_ai_quota', { feature_name: 'trip-excel' })
    if (quotaError) {
      console.error('AI quota check failed', quotaError.message)
      return jsonResponse({ error: 'AI 사용량을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 503)
    }
    if (!quota?.allowed) return jsonResponse({ error: quota?.message || 'AI 사용 한도에 도달했습니다.', code: quota?.code, retry_after: quota?.retry_after }, 429)

    const prompt = `여행 일정 Excel을 여행온 앱의 일정 데이터로 정리하세요.

여행 정보:
- 제목: ${String(trip.title || '').slice(0, 120)}
- 목적지: ${String(trip.destination || '').slice(0, 120)}
- 기간: ${trip.startDate} ~ ${trip.endDate}
- 기본 통화: ${['VND', 'KRW', 'USD', 'JPY', 'THB', 'SGD', 'EUR', 'GBP', 'CNY', 'TWD', 'PHP', 'MYR', 'IDR'].includes(trip.currency) ? trip.currency : 'USD'}

규칙:
1. 표의 명시된 값을 최우선으로 보존하고 날짜별 일정 한 건당 item 하나를 만드세요.
2. 날짜는 여행 기간 안의 YYYY-MM-DD, 시간은 알 수 있으면 HH:MM, 모르면 null입니다.
3. 금액은 숫자만 저장하고 통화를 분리하세요. 금액이나 통화를 추측하지 마세요.
4. 항공권과 숙소 예약 결제는 명시된 내용상 이미 결제했다면 prepaid로 분류하세요.
5. 현금/카드가 명시되지 않으면 문맥상 확실한 경우만 분류하고, 불확실하면 card로 두고 해당 item warnings에 확인 필요를 적으세요.
6. 예약번호·예약 사이트·URL은 표에 존재할 때만 넣으세요. URL은 https 링크만 허용하고 그 외에는 null입니다.
7. 중복 머리글, 합계, 설명문은 일정으로 만들지 마세요.
8. 한국어 제목을 사용하고, 확신이 낮은 해석은 warnings에 구체적으로 표시하세요.

Excel 시트 JSON:
${serializedSheets}`

    const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.6-sol',
        store: false,
        reasoning: { effort: 'low' },
        max_output_tokens: 20000,
        input: prompt,
        text: {
          verbosity: 'low',
          format: { type: 'json_schema', name: 'trip_schedule', strict: true, schema: scheduleSchema },
        },
      }),
    })

    const responseBody = await openAiResponse.json()
    if (!openAiResponse.ok) {
      console.error('OpenAI request failed', responseBody?.error?.code, responseBody?.error?.message)
      return jsonResponse({ error: 'AI 분석 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.' }, 502)
    }

    const outputText = responseBody.output_text || responseBody.output
      ?.flatMap((entry: { content?: Array<{ type?: string; text?: string }> }) => entry.content || [])
      .find((content: { type?: string }) => content.type === 'output_text')?.text
    if (!outputText) return jsonResponse({ error: 'AI가 분석 결과를 만들지 못했습니다.' }, 502)

    const result = JSON.parse(outputText)
    const validItems = result.items.filter((item: { day_date: string }) => item.day_date >= trip.startDate && item.day_date <= trip.endDate)
    if (!validItems.length) return jsonResponse({ error: '여행 기간 안에서 일정을 찾지 못했습니다.' }, 422)
    return jsonResponse({ ...result, items: validItems, quota: { remaining: quota.remaining, limit: quota.limit } })
  } catch (error) {
    console.error(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Excel 분석 중 오류가 발생했습니다.' }, 500)
  }
})
