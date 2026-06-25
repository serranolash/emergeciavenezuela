import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      tipo_reporte = 'Conocido',
      nombre_completo,
      descripcion_fisica,
      ubicacion_exacta,
      estado,
      contacto,
      nota_adicional,
    } = body;

    if (!id || !ubicacion_exacta || !estado || !contacto) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: id, ubicacion_exacta, estado, contacto' },
        { status: 400 }
      );
    }

    if (tipo_reporte === 'Conocido' && !nombre_completo) {
      return NextResponse.json(
        { error: 'Para reportes conocidos, el nombre completo es obligatorio' },
        { status: 400 }
      );
    }

    if (tipo_reporte === 'Sin Identificar' && !descripcion_fisica) {
      return NextResponse.json(
        { error: 'Para reportes sin identificar, la descripción física es obligatoria' },
        { status: 400 }
      );
    }

    const allowedEstados = ['A salvo', 'Herido', 'Desaparecido', 'En tránsito'];
    if (!allowedEstados.includes(estado)) {
      return NextResponse.json(
        { error: `Estado inválido. Debe ser uno de: ${allowedEstados.join(', ')}` },
        { status: 400 }
      );
    }

    const reporte = await db.reporteEmergencia.create({
      data: {
        id,
        tipoReporte: tipo_reporte,
        nombreCompleto: tipo_reporte === 'Conocido' ? nombre_completo : null,
        descripcionFisica: tipo_reporte === 'Sin Identificar' ? descripcion_fisica : null,
        ubicacionExacta: ubicacion_exacta,
        estado,
        contacto,
        notaAdicional: nota_adicional || null,
      },
    });

    triggerAiAnalysis(reporte.id, {
      tipo_reporte,
      nombre_completo,
      descripcion_fisica,
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
            { descripcionFisica: { contains: query } },
          ],
        }
      : {};

    const reportes = await db.reporteEmergencia.findMany({
      where,
      orderBy: { fechaRegistro: 'desc' },
      take: 200,
    });

    // Compute metrics
    const metrics = {
      total: reportes.length,
      conocidos: reportes.filter((r) => r.tipoReporte === 'Conocido').length,
      sinIdentificar: reportes.filter((r) => r.tipoReporte === 'Sin Identificar').length,
      aSalvo: reportes.filter((r) => r.estado === 'A salvo').length,
      heridos: reportes.filter((r) => r.estado === 'Herido').length,
      desaparecidos: reportes.filter((r) => r.estado === 'Desaparecido').length,
      enTransito: reportes.filter((r) => r.estado === 'En tránsito').length,
      conIa: reportes.filter((r) => r.urgenciaAi !== null).length,
      pendienteIa: reportes.filter((r) => r.urgenciaAi === null).length,
    };

    return NextResponse.json({ success: true, reportes, metrics });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function triggerAiAnalysis(
  reporteId: string,
  data: Record<string, string | undefined>
) {
  try {
    const zai = await ZAI.create();

    const lines: string[] = [`Tipo: ${data.tipo_reporte}`];
    if (data.nombre_completo) lines.push(`Nombre: ${data.nombre_completo}`);
    if (data.descripcion_fisica) lines.push(`Descripción física: ${data.descripcion_fisica}`);
    lines.push(`Ubicación: ${data.ubicacion_exacta}`);
    lines.push(`Estado: ${data.estado}`);
    lines.push(`Contacto: ${data.contacto}`);
    if (data.nota_adicional) lines.push(`Nota: ${data.nota_adicional}`);

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            'Analiza este reporte de emergencia y clasifica la urgencia de 1 a 5. Devuelve solo un JSON: {"urgencia": int, "prioridad_desc": string}',
        },
        { role: 'user', content: lines.join('\n') },
      ],
      thinking: { type: 'disabled' },
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '';
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return;

    const parsed = JSON.parse(jsonMatch[0]);
    const urgencia = Math.max(1, Math.min(5, Number(parsed.urgencia) || 3));
    const prioridadDesc = String(parsed.prioridad_desc || 'Sin clasificación');

    await db.reporteEmergencia.update({
      where: { id: reporteId },
      data: { urgenciaAi: urgencia, prioridadDesc },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[AI Analysis] Error: ${message}`);
  }
}