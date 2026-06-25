import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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

    // Importación dinámica — graciosa en Vercel
    let ZAI: unknown;
    try {
      ZAI = (await import('z-ai-web-dev-sdk')).default;
    } catch {
      return NextResponse.json({
        success: false,
        message: 'Análisis de IA no disponible en este entorno de despliegue. Funciona en el entorno de desarrollo local.',
      });
    }

    const zai = await (ZAI as { create: () => Promise<unknown> }).create();

    const tipo = reporte.nombreCompleto ? 'Conocido' : 'Sin Identificar';
    const lines: string[] = [`Tipo: ${tipo}`];
    if (reporte.nombreCompleto) lines.push(`Nombre: ${reporte.nombreCompleto}`);
    if (reporte.descripcionFisica) lines.push(`Descripción física: ${reporte.descripcionFisica}`);
    lines.push(`Ubicación: ${reporte.ubicacionExacta}`);
    lines.push(`Estado: ${reporte.estado}`);
    lines.push(`Contacto: ${reporte.contacto}`);
    if (reporte.notaAdicional) lines.push(`Nota adicional: ${reporte.notaAdicional}`);

    const completion = await (zai as { chat: { completions: { create: (opts: unknown) => Promise<{ choices: Array<{ message: { content: string } }> }> } } }).chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            'Analiza este reporte de emergencia y clasifica la urgencia de 1 a 5. Devuelve solo un JSON: {"urgencia": int, "prioridad_desc": string}',
        },
        {
          role: 'user',
          content: lines.join('\n'),
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

    const enriched = {
      ...(updated as unknown as Record<string, unknown>),
      tipoReporte: tipo,
    };

    return NextResponse.json({ success: true, reporte: enriched });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}