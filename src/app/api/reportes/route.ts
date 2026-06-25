import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const { id, nombre_completo, ubicacion_exacta, estado, contacto, nota_adicional } = await request.json();

    if (!id || !nombre_completo || !ubicacion_exacta || !estado || !contacto) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: id, nombre_completo, ubicacion_exacta, estado, contacto' },
        { status: 400 }
      );
    }

    const allowedEstados = ['A salvo', 'Herido', 'Desaparecido'];
    if (!allowedEstados.includes(estado)) {
      return NextResponse.json(
        { error: `Estado inválido. Debe ser uno de: ${allowedEstados.join(', ')}` },
        { status: 400 }
      );
    }

    const reporte = await db.reporteEmergencia.create({
      data: {
        id,
        nombreCompleto: nombre_completo,
        ubicacionExacta: ubicacion_exacta,
        estado,
        contacto,
        notaAdicional: nota_adicional || null,
      },
    });

    // Trigger AI analysis asynchronously (fire-and-forget with best-effort)
    triggerAiAnalysis(reporte.id, {
      nombre_completo,
      ubicacion_exacta,
      estado,
      contacto,
      nota_adicional,
    }).catch((err) => {
      console.error('[AI Analysis] Background error:', err.message);
    });

    return NextResponse.json({ success: true, reporte }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim() || '';

    const where = query
      ? {
          OR: [
            { nombreCompleto: { contains: query } },
            { ubicacionExacta: { contains: query } },
          ],
        }
      : {};

    const reportes = await db.reporteEmergencia.findMany({
      where,
      orderBy: { fechaRegistro: 'desc' },
      take: 100,
    });

    return NextResponse.json({ success: true, reportes });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// --- Background AI Analysis ---

async function triggerAiAnalysis(
  reporteId: string,
  data: {
    nombre_completo: string;
    ubicacion_exacta: string;
    estado: string;
    contacto: string;
    nota_adicional?: string;
  }
) {
  try {
    const zai = await ZAI.create();

    const reportText = [
      `Nombre: ${data.nombre_completo}`,
      `Ubicación: ${data.ubicacion_exacta}`,
      `Estado: ${data.estado}`,
      `Contacto: ${data.contacto}`,
      data.nota_adicional ? `Nota adicional: ${data.nota_adicional}` : '',
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

    // Extract JSON from possible markdown code blocks
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      console.error('[AI Analysis] No JSON found in response:', raw);
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const urgencia = Math.max(1, Math.min(5, Number(parsed.urgencia) || 3));
    const prioridadDesc = String(parsed.prioridad_desc || 'Sin clasificación');

    await db.reporteEmergencia.update({
      where: { id: reporteId },
      data: { urgenciaAi: urgencia, prioridadDesc },
    });

    console.log(`[AI Analysis] Reporte ${reporteId} → Urgencia ${urgencia}: ${prioridadDesc}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[AI Analysis] Error analyzing reporte ${reporteId}:`, message);
  }
}