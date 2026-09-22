// Competency Assessment Engine v2.0 — Phase 11: Gemini AI Analysis (spec sections 18-27).
//
// Runs entirely server-side (Supabase Edge Function). The GEMINI_API_KEY secret is read only from
// the server environment here and NEVER sent to or read by the frontend (spec section 18/34).
//
// The Supabase client below is created with the CALLING USER's own JWT (forwarded from the
// Authorization header), not a service-role key — so this function only ever sees data that user's
// own RLS grants already expose, and question content is read exclusively via
// comp_question_bank_public() (no reference answers, key points, etc. — spec section 2 keeps that
// admin/designer-only). Scope: only DB-backed role assessments (selected_question_ids) are
// supported for now — project_manager's fixed in-code rubric isn't duplicated into this function,
// so PM assessments get a clear "not yet supported" response instead of guessing.
//
// Schema types below are plain uppercase strings ("OBJECT"/"STRING"/...) rather than the SDK's
// `Type` enum — that's what the Gemini API's OpenAPI-subset schema actually expects on the wire, so
// this has no dependency on exactly how (or whether) a given @google/genai version re-exports that
// enum.

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
  console.error(`comp-gemini-analysis: ${message}`, err ?? '')
  return json({ error: message }, status)
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    executive_summary: { type: 'STRING' },
    overall_assessment: { type: 'STRING' },
    competency_analysis: {
      type: 'OBJECT',
      properties: Object.fromEntries(
        ['technical', 'problem_solving', 'experience', 'hse', 'judgment', 'communication', 'leadership', 'commercial'].map((key) => [
          key,
          {
            type: 'OBJECT',
            properties: {
              score: { type: 'NUMBER' },
              analysis: { type: 'STRING' },
              evidence: { type: 'ARRAY', items: { type: 'STRING' } },
            },
            required: ['score', 'analysis', 'evidence'],
          },
        ]),
      ),
      required: ['technical', 'problem_solving', 'experience', 'hse', 'judgment', 'communication', 'leadership', 'commercial'],
    },
    strengths: { type: 'ARRAY', items: { type: 'STRING' } },
    development_areas: { type: 'ARRAY', items: { type: 'STRING' } },
    critical_gaps: { type: 'ARRAY', items: { type: 'STRING' } },
    recommended_training: { type: 'ARRAY', items: { type: 'STRING' } },
    follow_up_questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question_id: { type: 'STRING' },
          question: { type: 'STRING' },
          reason: { type: 'STRING' },
        },
        required: ['question', 'reason'],
      },
    },
    evidence_log: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question_id: { type: 'STRING' },
          candidate_answer: { type: 'STRING' },
          analysis: { type: 'STRING' },
        },
        required: ['question_id', 'analysis'],
      },
    },
    confidence: { type: 'NUMBER' },
  },
  required: [
    'executive_summary',
    'overall_assessment',
    'competency_analysis',
    'strengths',
    'development_areas',
    'critical_gaps',
    'recommended_training',
    'follow_up_questions',
    'evidence_log',
    'confidence',
  ],
}

const SYSTEM_INSTRUCTION = `تو یک دستیار تحلیل ارزیابی شایستگی برای پروژه‌های EPC نفت و گاز هستی.
قوانین سخت‌گیرانه‌ای که باید رعایت کنی:
1. فقط از داده‌های واقعی ارائه‌شده (پاسخ متقاضی، امتیاز داوران، یادداشت داوران) استفاده کن — هرگز اطلاعاتی که در داده‌ها نیست را اختراع نکن.
2. هرگز نتیجه‌گیری قطعی درباره مناسب‌بودن یا نبودن نهایی متقاضی برای شغل نده (مثل "قطعاً مناسب است" یا "قطعاً مناسب نیست") — تصمیم نهایی فقط با داوران و قوانین سیستم است، نه با تو.
3. از زبان مبتنی بر شواهد استفاده کن: «پاسخ‌های متقاضی نشان‌دهنده...»، «در حوزه X شواهد کافی مشاهده نشد...»، «برای ارزیابی دقیق‌تر این موضوع، پیشنهاد می‌شود...».
4. اگر پاسخ متقاضی به یک سؤال ناقص، متناقض، سطحی یا مبهم بود، یک سؤال پیگیری (follow-up) دقیق برای آن پیشنهاد بده.
5. هر تحلیل باید در صورت امکان به شناسه سؤال (question_id) و متن پاسخ متقاضی مرتبط باشد (evidence_log).
6. خروجی را کاملاً به فارسی و دقیقاً مطابق ساختار JSON درخواستی بنویس.
7. امتیاز هر بعد شایستگی (competency_analysis) را بین ۰ تا ۱۰۰ بده و آن را صرفاً از روی امتیازهای واقعی ثبت‌شده داوران برای سؤالات مرتبط با همان بعد استخراج کن، نه حدس شخصی.
8. اگر برای یک بعد شایستگی هیچ سؤال یا امتیازی وجود نداشت، در تحلیل آن صراحتاً بنویس «شواهد کافی برای این حوزه در این ارزیابی ثبت نشده است» و امتیاز آن را صفر بگذار.`

function resolveOfficialScore(
  questionId: string,
  leadAnswers: Record<string, { score?: number | null; note?: string; candidateAnswer?: string }>,
  panelistScores: Array<{ submitted_at: string | null; answers: Record<string, { score?: number | null; note?: string }> }>,
): { score: number | null; notes: string[] } {
  const submitted = panelistScores.filter((p) => p.submitted_at)
  const notes: string[] = []
  if (submitted.length > 0) {
    const scores = submitted.map((p) => p.answers?.[questionId]?.score).filter((s): s is number => typeof s === 'number')
    for (const p of submitted) {
      const note = p.answers?.[questionId]?.note
      if (note) notes.push(note)
    }
    return { score: scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null, notes }
  }
  const leadNote = leadAnswers?.[questionId]?.note
  if (leadNote) notes.push(leadNote)
  return { score: leadAnswers?.[questionId]?.score ?? null, notes }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiKey) return fail(500, 'GEMINI_API_KEY تنظیم نشده است. لطفاً آن را در Supabase Edge Function Secrets تنظیم کنید.')

    const { assessmentId } = await req.json()
    if (!assessmentId) return fail(400, 'assessmentId الزامی است.')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return fail(401, 'احراز هویت لازم است.')

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: assessment, error: assessmentError } = await supabase.from('comp_assessments').select('*').eq('id', assessmentId).single()
    if (assessmentError || !assessment) return fail(404, 'ارزیابی یافت نشد یا دسترسی مجاز نیست.', assessmentError)

    if (assessment.job_role === 'project_manager') {
      return fail(400, 'تحلیل هوشمند برای رابط ثابت مدیر پروژه هنوز پشتیبانی نمی‌شود — فقط برای مشاغل بانک‌سؤال‌محور فعال است.')
    }

    const [{ data: panelistScores, error: panelistError }, { data: bankRows, error: bankError }] = await Promise.all([
      supabase.from('comp_panelist_scores').select('submitted_at, answers').eq('assessment_id', assessmentId),
      supabase.rpc('comp_question_bank_public'),
    ])
    if (panelistError) return fail(500, `بارگذاری امتیازهای داوران ناموفق بود: ${panelistError.message}`, panelistError)
    if (bankError) return fail(500, `بارگذاری بانک سؤالات ناموفق بود: ${bankError.message}`, bankError)

    const selectedIds: string[] = Array.isArray(assessment.selected_question_ids) ? assessment.selected_question_ids : []
    const questions = (bankRows ?? []).filter((q: { id: string; job_role: string }) => selectedIds.includes(q.id))

    if (questions.length === 0) {
      return fail(400, 'هنوز سؤالی برای این ارزیابی انتخاب نشده — ابتدا آزمون را طراحی و سؤالات را تولید کنید.')
    }

    const answersPayload = questions.map((q: { id: string; category: string; sub_category: string; difficulty: string; question_text: string }) => {
      const { score, notes } = resolveOfficialScore(q.id, assessment.answers ?? {}, panelistScores ?? [])
      const candidateAnswer = (assessment.answers ?? {})[q.id]?.candidateAnswer ?? ''
      return {
        question_id: q.id,
        category: q.category,
        topic: q.sub_category,
        difficulty: q.difficulty,
        question_text: q.question_text,
        candidate_answer: candidateAnswer,
        judge_score_0_5: score,
        judge_notes: notes,
      }
    })

    const candidateProfile = {
      name: assessment.candidate_name,
      job_role: assessment.job_role,
      years_experience_total: assessment.years_experience_total,
      years_experience_pipeline: assessment.years_experience_pipeline,
      current_employer: assessment.current_employer,
      education: assessment.education,
      certifications: assessment.certifications,
      employment_history: assessment.employment_history,
      notable_projects: assessment.notable_projects,
    }

    const promptPayload = {
      candidate_profile: candidateProfile,
      assessment_structure: { total_questions: questions.length, question_types: [...new Set(questions.map((q: { category: string }) => q.category))] },
      questions_and_answers: answersPayload,
    }

    const model = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash'
    let response
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey })
      response = await ai.models.generateContent({
        model,
        contents: `داده‌های زیر مربوط به یک ارزیابی شایستگی واقعی است. طبق قوانین ارائه‌شده، آن را تحلیل کن:\n\n${JSON.stringify(promptPayload, null, 2)}`,
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

    const confidence = typeof (analysis as { confidence?: unknown }).confidence === 'number' ? (analysis as { confidence: number }).confidence : null

    const { data: inserted, error: insertError } = await supabase
      .from('comp_ai_analysis')
      .insert({ assessment_id: assessmentId, model, analysis, confidence })
      .select('*')
      .single()
    if (insertError) return fail(500, `ذخیره تحلیل ناموفق بود: ${insertError.message}`, insertError)

    await supabase.rpc('comp_log_audit', {
      p_action: 'AI_ANALYSIS_GENERATED',
      p_entity_type: 'comp_assessments',
      p_entity_id: assessmentId,
      p_previous: null,
      p_new: { model },
    })

    return json({ analysis: inserted })
  } catch (err) {
    return fail(500, err instanceof Error ? err.message : 'خطای غیرمنتظره', err)
  }
})
