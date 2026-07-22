import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'day_date', 'start_time', 'place_name', 'address_candidate', 'memo', 'estimated_cost', 'cost_category', 'payment_method', 'cost_currency', 'reservation_status', 'reservation_site', 'reservation_reference', 'reservation_url', 'warnings'],
  properties: {
    title: { type: 'string', minLength: 1 },
    day_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    start_time: { anyOf: [{ type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }, { type: 'null' }] },
    place_name: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    address_candidate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    memo: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    estimated_cost: { type: 'number', minimum: 0 },
    cost_category: { type: 'string', enum: ['flight', 'accommodation', 'food', 'transport', 'activity', 'shopping', 'other'] },
    payment_method: { type: 'string', enum: ['cash', 'card', 'either', 'prepaid'] },
    cost_currency: { type: 'string', enum: ['VND', 'KRW', 'USD', 'JPY', 'THB', 'SGD', 'EUR', 'GBP', 'CNY', 'TWD', 'PHP', 'MYR', 'IDR'] },
    reservation_status: { type: 'string', enum: ['none', 'planned', 'booked', 'cancelled'] },
    reservation_site: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    reservation_reference: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    reservation_url: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    warnings: { type: 'array', items: { type: 'string' } },
  },
}

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return respond({ error: 'POST 요청만 지원합니다.' }, 405)

  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization) return respond({ error: '로그인이 필요합니다.' }, 401)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const openAiKey = Deno.env.get('OPENAI_API_KEY')
    if (!supabaseUrl || !supabaseAnonKey || !openAiKey) return respond({ error: '서버 설정이 완료되지 않았습니다.' }, 500)

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    })
    const { data: { user }, error: userError } = await supabase.auth.getUser(authorization.replace(/^Bearer\s+/i, ''))
    if (userError || !user) return respond({ error: '로그인 세션을 확인할 수 없습니다.' }, 401)

    const { note, trip, selectedDate } = await request.json()
    const cleanNote = String(note || '').trim().slice(0, 3000)
    if (!cleanNote || !trip?.startDate || !trip?.endDate) return respond({ error: '일정 설명과 여행 기간이 필요합니다.' }, 400)

    const { data: quota, error: quotaError } = await supabase.rpc('consume_ai_quota', { feature_name: 'schedule-draft' })
    if (quotaError) {
      console.error('AI quota check failed', quotaError.message)
      return respond({ error: 'AI 사용량을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 503)
    }
    if (!quota?.allowed) return respond({ error: quota?.message || 'AI 사용 한도에 도달했습니다.', code: quota?.code, retry_after: quota?.retry_after }, 429)

    const prompt = `사용자의 자연어 설명을 여행 앱의 일정 입력값으로 정리하세요.

여행: ${String(trip.title || '').slice(0, 120)} / ${String(trip.destination || '').slice(0, 120)}
여행 기간: ${trip.startDate} ~ ${trip.endDate}
현재 선택 날짜: ${selectedDate || trip.startDate}
기본 통화: ${['VND', 'KRW', 'USD', 'JPY', 'THB', 'SGD', 'EUR', 'GBP', 'CNY', 'TWD', 'PHP', 'MYR', 'IDR'].includes(trip.currency) ? trip.currency : 'USD'}

사용자 설명:
${cleanNote}

규칙:
- 설명에 연도나 날짜가 생략되면 여행 기간과 현재 선택 날짜를 기준으로 해석하세요.
- 사용자가 말한 내용만으로 반드시 초안을 완성하세요. 일부 정보가 없어도 초안 생성을 거부하거나 추가 질문만 하지 마세요.
- 일정 제목은 설명에서 가장 분명한 행동과 장소를 짧게 요약하세요.
- 날짜가 없으면 현재 선택 날짜를 사용하고, 시간이 없으면 start_time은 null로 두세요.
- 금액이 없으면 estimated_cost는 0, 통화가 없으면 기본 통화를 사용하세요. '원/만원'은 KRW, '엔'은 JPY, '동'은 VND로 해석하세요.
- 결제 방법이 없으면 payment_method는 either, 비용 분류가 불분명하면 other를 사용하세요.
- 예약 정보가 없으면 reservation_status는 none이고 예약 관련 필드는 null로 두세요.
- 화면의 기본값으로 처리되는 estimated_cost 0, cost_category other, payment_method either, 기본 통화, reservation_status none은 누락 정보가 아닙니다. 사용자가 다른 값을 명시하지 않으면 그대로 사용하고 warnings에 적지 마세요.
- 사용자가 명시한 항목만 기본값에서 변경하세요. 기본값을 확인하기 위한 질문이나 경고를 만들지 마세요.
- 금액, 예약번호와 URL은 명시된 내용만 사용하고 추측하지 마세요.
- 주소는 사용자가 정확히 말한 경우만 address_candidate에 넣으세요. 장소명만 있으면 주소를 지어내지 말고 null로 두세요.
- 장소명이 있으면 Google Places 검색에 적합한 구체적인 이름으로 정리하세요.
- 목적지나 세부 내용이 미정이라고 말한 경우 그 사실을 memo에 보존하고, 나머지 확인된 값은 정상적으로 채우세요.
- warnings는 날짜가 여행 기간 밖이거나 금액 단위를 전혀 해석할 수 없는 등 저장 전에 반드시 확인해야 하는 문제에만 사용하세요. 결제 방법·주소·예약 정보가 없다는 이유로 경고하지 마세요.
- 저장은 하지 않고 사용자가 검토할 초안만 만드세요.`

    const apiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.6-sol',
        store: false,
        reasoning: { effort: 'low' },
        max_output_tokens: 2000,
        input: prompt,
        text: { verbosity: 'low', format: { type: 'json_schema', name: 'schedule_draft', strict: true, schema } },
      }),
    })
    const body = await apiResponse.json()
    if (!apiResponse.ok) {
      const errorCode = String(body?.error?.code || body?.error?.type || '')
      console.error('OpenAI request failed', errorCode, body?.error?.message)
      const publicMessage = errorCode.includes('invalid_api_key')
        ? 'OpenAI API 키가 올바르지 않습니다. Supabase 비밀키 설정을 확인해 주세요.'
        : errorCode.includes('insufficient_quota') || errorCode.includes('billing')
          ? 'OpenAI API 사용 한도 또는 결제 설정을 확인해 주세요.'
          : errorCode.includes('model_not_found')
            ? '현재 API 프로젝트에서 AI 모델을 사용할 수 없습니다.'
            : 'AI 일정 분석에 실패했습니다. 잠시 후 다시 시도해 주세요.'
      return respond({ error: publicMessage, code: errorCode || 'openai_request_failed' }, 502)
    }
    const outputText = body.output_text || body.output
      ?.flatMap((entry: { content?: Array<{ type?: string; text?: string }> }) => entry.content || [])
      .find((content: { type?: string }) => content.type === 'output_text')?.text
    if (!outputText) return respond({ error: 'AI가 일정 초안을 만들지 못했습니다.' }, 502)
    const draft = JSON.parse(outputText)
    if (draft.day_date < trip.startDate || draft.day_date > trip.endDate) {
      draft.day_date = selectedDate || trip.startDate
      draft.warnings.push('날짜가 여행 기간 밖이라 현재 선택 날짜로 조정했습니다.')
    }
    return respond({ draft, quota: { remaining: quota.remaining, limit: quota.limit } })
  } catch (error) {
    console.error(error)
    return respond({ error: error instanceof Error ? error.message : '일정 분석 중 오류가 발생했습니다.' }, 500)
  }
})
