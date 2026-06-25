import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const { reporteId } = await request.json();

    if (!reporteId) {
      return NextResponse.json({ error: 'reporteId es requerido' }, { status: 400 });
    }

    const reporte = await db.reporteEmergencia.findUnique({
      where: { id: reporteId },
    });

    if (!reporte) {
      return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 });
    }

    const zai = await ZAI.create();

    const reportText = [
      `Nombre: ${reporte.nombreCompleto}`,
      `Ubicación: ${reporte.ubicacionExacta}`,
      `Estado: ${reporte.estado}`,
      `Contacto: ${reporte.contacto}`,
      reporte.notaAdicional ? `Nota adicional: ${reporte.notaAdicional}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            'Analiza este reporte de emergencia y clasifica la urgencia de 1 a 5. Devuelve solo un JSON: {"urgencia": int, "prioridad_desc": string}',
        },
        {
          role: 'user',
          content: reportText,
        },
      ],
      thinking: { type: 'disabled' },
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '';
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'La IA no devolvió un JSON válido', raw }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const urgencia = Math.max(1, Math.min(5, Number(parsed.urgencia) || 3));
    const prioridadDesc = String(parsed.prioridad_desc || 'Sin clasificación');

    const updated = await db.reporteEmergencia.update({
      where: { id: reporteId },
      data: { urgenciaAi: urgencia, prioridadDesc },
    });

    return NextResponse.json({ success: true, reporte: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}