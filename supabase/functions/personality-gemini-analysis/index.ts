// Personality & Behavioral Assessment Engine — Gemini AI Analysis, mirroring comp-gemini-analysis's
// pattern exactly (same JWT-forwarding, same structured-schema, same "AI is an assistant, never the
// final decision maker" framing).
//
// The Supabase client is created with the CALLING USER's own JWT (forwarded from the Authorization
// header), not a service-role key — so this function only ever sees data that user's own RLS grants
// already expose (personality_can_access_assessment). Unlike the candidate-facing UI, the caller
// here is always a staff member with legitimate access to the full question/response content
// (dimension_id, trait_id, per-option dimension_key/score) — there is no "public projection"
// restriction to apply server-side, since RLS already scopes it correctly.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { GoogleGenAI } from 'npm:@google/genai@1'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
}

function fail(status: number, message: string, err?: unknown) {
  console.error(`personality-gemini-analysis: ${message}`, err ?? '')
  return json({ error: message }, status)
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    executive_summary: { type: 'STRING' },
    response_validity_interpretation: { type: 'STRING' },
    trait_analysis: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          trait_key: { type: 'STRING' },
          score: { type: 'NUMBER' },
          range_label: { type: 'STRING' },
          analysis: { type: 'STRING' },
        },
        required: ['trait_key', 'score', 'range_label', 'analysis'],
      },
    },
    behavioral_analysis: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          dimension_key: { type: 'STRING' },
          score: { type: 'NUMBER' },
          analysis: { type: 'STRING' },
          evidence: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['dimension_key', 'score', 'analysis', 'evidence'],
      },
    },
    observed_patterns: { type: 'ARRAY', items: { type: 'STRING' } },
    strength_patterns: { type: 'ARRAY', items: { type: 'STRING' } },
    watchpoints: { type: 'ARRAY', items: { type: 'STRING' } },
    development_areas: { type: 'ARRAY', items: { type: 'STRING' } },
    follow_up_questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          purpose: { type: 'STRING' },
          competency: { type: 'STRING' },
          dimension_key: { type: 'STRING' },
          evidence_to_look_for: { type: 'STRING' },
          positive_indicators: { type: 'ARRAY', items: { type: 'STRING' } },
          risk_indicators: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['question', 'purpose', 'competency', 'dimension_key', 'evidence_to_look_for', 'positive_indicators', 'risk_indicators'],
      },
    },
    training_recommendations: { type: 'ARRAY', items: { type: 'STRING' } },
    career_development_paths: { type: 'ARRAY', items: { type: 'STRING' } },
    evidence: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          source_type: { type: 'STRING', enum: ['QUESTION', 'SJT', 'JUDGE_COMMENT', 'EXPERIENCE'] },
          source_id: { type: 'STRING' },
          dimension_key: { type: 'STRING' },
          note: { type: 'STRING' },
        },
        required: ['source_type', 'source_id', 'dimension_key', 'note'],
      },
    },
    confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
  },
  required: [
    'executive_summary',
    'response_validity_interpretation',
    'trait_analysis',
    'behavioral_analysis',
    'observed_patterns',
    'strength_patterns',
    'watchpoints',
    'development_areas',
    'follow_up_questions',
    'training_recommendations',
    'career_development_paths',
    'evidence',
    'confidence',
  ],
}

const SYSTEM_INSTRUCTION = `تو یک دستیار تحلیل ارزیابی شخصیت و رفتار حرفه‌ای برای استخدام در پروژه‌های EPC نفت و گاز هستی.
قوانین سخت‌گیرانه‌ای که باید رعایت کنی:
1. فقط از داده‌های واقعی ارائه‌شده (امتیازهای محاسبه‌شده ویژگی‌ها/ابعاد رفتاری، الگوهای محاسبه‌شده، نتیجه اعتبارسنجی پاسخ، و پاسخ‌های خام متقاضی) استفاده کن — هرگز اطلاعاتی که در داده‌ها نیست را اختراع نکن.
2. هرگز نتیجه‌گیری قطعی درباره استخدام یا رد متقاضی نده — این ابزار صرفاً دستیار تحلیلی است، تصمیم نهایی همیشه با تیم استخدام است.
3. هرگز شخصیت متقاضی را «برچسب‌گذاری تشخیصی» نکن (مثل نام بردن از اختلالات روانی) — فقط از زبان رفتاری-حرفه‌ای استفاده کن.
4. اگر نتیجه اعتبارسنجی پاسخ نشان‌دهنده پاسخ یکنواخت (straight-lining) یا پاسخ‌های ناقص بود، این موضوع را صریحاً در response_validity_interpretation ذکر کن و تفسیر امتیازها را با احتیاط بیشتری بیان کن.
5. هر تحلیل رفتاری باید در صورت امکان به یک مدرک مشخص (evidence) با شناسه سؤال یا بعد مرتبط باشد.
6. برای هر بعد رفتاری که امتیاز پایینی دارد یا برای شغل مورد نظر حیاتی (critical) است، یک سؤال پیگیری دقیق برای مصاحبه ساختاریافته پیشنهاد بده که شواهد رفتاری واقعی (نه فرضی) را بررسی کند.
7. خروجی را کاملاً به فارسی و دقیقاً مطابق ساختار JSON درخواستی بنویس.
8. اگر برای یک ویژگی یا بعد رفتاری شواهد کافی (coverage) وجود نداشت، در تحلیل آن صراحتاً بنویس «شواهد کافی برای این حوزه ثبت نشده است».`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiKey) return fail(500, 'GEMINI_API_KEY تنظیم نشده است. لطفاً آن را در Supabase Edge Function Secrets تنظیم کنید.')

    const { personalityAssessmentId } = await req.json()
    if (!personalityAssessmentId) return fail(400, 'personalityAssessmentId الزامی است.')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return fail(401, 'احراز هویت لازم است.')

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: assessment, error: assessmentError } = await supabase
      .from('personality_assessments')
      .select('*')
      .eq('id', personalityAssessmentId)
      .single()
    if (assessmentError || !assessment) return fail(404, 'ارزیابی یافت نشد یا دسترسی مجاز نیست.', assessmentError)

    if (!['FINGERPRINT', 'AI_ANALYSIS', 'FINAL_REVIEW', 'LOCKED', 'ARCHIVED'].includes(assessment.status)) {
      return fail(400, 'ابتدا باید ارزیابی توسط متقاضی تکمیل و امتیازدهی شده باشد.')
    }

    const [{ data: dimensionScores, error: scoresError }, { data: validity, error: validityError }, { data: responses, error: responsesError }] =
      await Promise.all([
        supabase
          .from('personality_dimension_scores')
          .select('score_kind, normalized_score, coverage_count, confidence, trait_id, dimension_id, personality_traits(key, label_fa), personality_behavioral_dimensions(key, label_fa)')
          .eq('personality_assessment_id', personalityAssessmentId),
        supabase.from('personality_validity_results').select('*').eq('personality_assessment_id', personalityAssessmentId).maybeSingle(),
        supabase
          .from('personality_responses')
          .select('question_id, response_value, personality_questions(question_text, question_type, options, trait_id, dimension_id)')
          .eq('personality_assessment_id', personalityAssessmentId),
      ])
    if (scoresError) return fail(500, `بارگذاری امتیازها ناموفق بود: ${scoresError.message}`, scoresError)
    if (validityError) return fail(500, `بارگذاری نتیجه اعتبارسنجی ناموفق بود: ${validityError.message}`, validityError)
    if (responsesError) return fail(500, `بارگذاری پاسخ‌ها ناموفق بود: ${responsesError.message}`, responsesError)

    if (!dimensionScores || dimensionScores.length === 0) {
      return fail(400, 'هنوز امتیازی برای این ارزیابی محاسبه نشده است.')
    }

    let requirements: { dimension_id: string; weight: number; min_threshold: number | null; is_critical: boolean }[] = []
    if (assessment.job_profile_id) {
      const { data } = await supabase
        .from('personality_job_behavioral_requirements')
        .select('dimension_id, weight, min_threshold, is_critical')
        .eq('profile_id', assessment.job_profile_id)
      requirements = data ?? []
    }

    type ScoreRow = {
      score_kind: string
      normalized_score: number | null
      coverage_count: number
      confidence: string
      trait_id: string | null
      dimension_id: string | null
      personality_traits: { key: string; label_fa: string } | null
      personality_behavioral_dimensions: { key: string; label_fa: string } | null
    }

    const traitAnalysisInput = (dimensionScores as ScoreRow[])
      .filter((s) => s.score_kind === 'TRAIT')
      .map((s) => ({
        trait_key: s.personality_traits?.key ?? s.trait_id,
        trait_label_fa: s.personality_traits?.label_fa ?? null,
        normalized_score: s.normalized_score,
        coverage_count: s.coverage_count,
        confidence: s.confidence,
      }))

    const dimensionAnalysisInput = (dimensionScores as ScoreRow[])
      .filter((s) => s.score_kind === 'BEHAVIORAL_DIMENSION')
      .map((s) => {
        const req = requirements.find((r) => r.dimension_id === s.dimension_id)
        return {
          dimension_key: s.personality_behavioral_dimensions?.key ?? s.dimension_id,
          dimension_label_fa: s.personality_behavioral_dimensions?.label_fa ?? null,
          normalized_score: s.normalized_score,
          coverage_count: s.coverage_count,
          confidence: s.confidence,
          is_critical_for_role: req?.is_critical ?? false,
          min_threshold_for_role: req?.min_threshold ?? null,
        }
      })

    type ResponseRow = {
      question_id: string
      response_value: { selected?: number | string; selected_option?: string }
      personality_questions: {
        question_text: string
        question_type: string
        options: { key: string; label_fa: string; dimension_key?: string; score?: number }[] | null
        trait_id: string | null
        dimension_id: string | null
      } | null
    }

    const responseEvidence = (responses as ResponseRow[] | null ?? []).map((r) => {
      const q = r.personality_questions
      const chosenOption = q?.options?.find((o) => o.key === r.response_value?.selected_option)
      return {
        question_id: r.question_id,
        question_type: q?.question_type,
        question_text: q?.question_text,
        selected_value: r.response_value?.selected ?? null,
        chosen_option_label: chosenOption?.label_fa ?? null,
        chosen_option_dimension_key: chosenOption?.dimension_key ?? null,
      }
    })

    const promptPayload = {
      job_role: assessment.job_role,
      computed_patterns: assessment.computed_patterns,
      computed_watchpoints: assessment.computed_watchpoints,
      validity_result: validity
        ? {
            overall_status: validity.overall_status,
            straight_lining_flag: validity.straight_lining_flag,
            missing_response_count: validity.missing_response_count,
            completion_seconds: validity.completion_seconds,
          }
        : null,
      trait_scores: traitAnalysisInput,
      behavioral_dimension_scores: dimensionAnalysisInput,
      response_evidence: responseEvidence,
    }

    // gemini-2.5-flash was retired ("no longer available to new users") — Google's own 404 error
    // named gemini-3.6-flash as the replacement (see comp-gemini-analysis's identical note), so this
    // function starts directly on the current model rather than repeating that discovery.
    const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.6-flash'
    let response
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey })
      response = await ai.models.generateContent({
        model,
        contents: `داده‌های زیر مربوط به یک ارزیابی شخصیت و رفتاری واقعی است. طبق قوانین ارائه‌شده، آن را تحلیل کن:\n\n${JSON.stringify(promptPayload, null, 2)}`,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      })
    } catch (geminiErr) {
      const detail = geminiErr instanceof Error ? geminiErr.message : String(geminiErr)
      return fail(502, `فراخوانی Gemini ناموفق بود: ${detail}`, geminiErr)
    }

    const text = response.text
    if (!text) return fail(502, 'پاسخی از Gemini دریافت نشد.')

    let analysis: unknown
    try {
      analysis = JSON.parse(text)
    } catch (parseErr) {
      return fail(502, 'پاسخ Gemini قابل تجزیه به JSON نبود.', { parseErr, text })
    }

    const confidence = typeof (analysis as { confidence?: unknown }).confidence === 'string' ? (analysis as { confidence: string }).confidence : null

    const { data: inserted, error: insertError } = await supabase
      .from('personality_ai_analysis')
      .insert({ personality_assessment_id: personalityAssessmentId, model, analysis, confidence })
      .select('*')
      .single()
    if (insertError) return fail(500, `ذخیره تحلیل ناموفق بود: ${insertError.message}`, insertError)

    await supabase.rpc('comp_log_audit', {
      p_action: 'PERSONALITY_AI_ANALYSIS_GENERATED',
      p_entity_type: 'personality_assessments',
      p_entity_id: personalityAssessmentId,
      p_previous: null,
      p_new: { model },
    })

    return json({ analysis: inserted })
  } catch (err) {
    return fail(500, err instanceof Error ? err.message : 'خطای غیرمنتظره', err)
  }
})
