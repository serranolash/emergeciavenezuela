import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ─── POST: Re-analizar urgencia con IA ───────────────────────
export async function POST(request: NextRequest) {
  try {
    const { reporteId } = await request.json();

    if (!reporteId) {
      return NextResponse.json({ error: 'reporteId es requerido' }, { status: 400 });
    }

    // Buscar reporte en Supabase
    const { data: reporte, error: fetchError } = await supabase
      .from('reportes_emergencia')
      .select('*')
      .eq('id', reporteId)
      .single();

    if (fetchError || !reporte) {
      return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 });
    }

    // Analizar con Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const reportText = [
      `Nombre: ${reporte.nombre_completo}`,
      `Ubicación: ${reporte.ubicacion_exacta}`,
      `Estado: ${reporte.estado}`,
      `Contacto: ${reporte.contacto}`,
      reporte.nota_adicional ? `Nota adicional: ${reporte.nota_adicional}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Analiza este reporte de emergencia y clasifica la urgencia de 1 a 5. Devuelve solo un JSON: {"urgencia": int, "prioridad_desc": string}\n\n${reportText}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 100,
      },
    });

    const raw = result.response.text().trim();
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'La IA no devolvió un JSON válido', raw },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const urgencia = Math.max(1, Math.min(5, Number(parsed.urgencia) || 3));
    const prioridadDesc = String(parsed.prioridad_desc || 'Sin clasificación');

    // Actualizar en Supabase
    const { data: updated, error: updateError } = await supabase
      .from('reportes_emergencia')
      .update({ urgencia_ai: urgencia, prioridad_desc: prioridadDesc })
      .eq('id', reporteId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, reporte: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}