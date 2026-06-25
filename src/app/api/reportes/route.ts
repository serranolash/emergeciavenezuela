import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// tipoReporte se calcula dinámicamente: si tiene nombre → "Conocido", si no → "Sin Identificar"
function computeTipoReporte(nombreCompleto: string | null): string {
  return nombreCompleto ? 'Conocido' : 'Sin Identificar';
}

// Agrega tipoReporte calculado a cada reporte
function enrichReporte(r: Record<string, unknown>) {
  return { ...r, tipoReporte: computeTipoReporte(r.nombreCompleto as string | null) };
}

// ─── POST: Crear reporte ────────────────────────────────────────
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
        nombreCompleto: tipo_reporte === 'Conocido' ? nombre_completo : null,
        descripcionFisica: tipo_reporte === 'Sin Identificar' ? descripcion_fisica : null,
        ubicacionExacta: ubicacion_exacta,
        estado,
        contacto,
        notaAdicional: nota_adicional || null,
      },
    });

    const enriched = enrichReporte(reporte as unknown as Record<string, unknown>);

    // AI analysis — fire and forget, no rompe si no está disponible
    triggerAiAnalysis(reporte.id, {
      tipo_reporte,
      nombre_completo: tipo_reporte === 'Conocido' ? nombre_completo : undefined,
      descripcion_fisica: tipo_reporte === 'Sin Identificar' ? descripcion_fisica : undefined,
      ubicacion_exacta,
      estado,
      contacto,
      nota_adicional,
    });

    return NextResponse.json({ success: true, reporte: enriched }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── GET: Listar reportes + métricas ────────────────────────────
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

    // Enriquecer cada reporte con tipoReporte calculado
    const enriched = reportes.map((r) =>
      enrichReporte(r as unknown as Record<string, unknown>)
    );

    // Calcular métricas
    const metrics = {
      total: enriched.length,
      conocidos: enriched.filter((r) => r.tipoReporte === 'Conocido').length,
      sinIdentificar: enriched.filter((r) => r.tipoReporte === 'Sin Identificar').length,
      aSalvo: enriched.filter((r) => r.estado === 'A salvo').length,
      heridos: enriched.filter((r) => r.estado === 'Herido').length,
      desaparecidos: enriched.filter((r) => r.estado === 'Desaparecido').length,
      enTransito: enriched.filter((r) => r.estado === 'En tránsito').length,
      conIa: enriched.filter((r) => r.urgenciaAi !== null).length,
      pendienteIa: enriched.filter((r) => r.urgenciaAi === null).length,
    };

    return NextResponse.json({ success: true, reportes: enriched, metrics });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── PATCH: Actualizar estado de un reporte ─────────────────────
export async function PATCH(request: NextRequest) {
  try {
    const { id, estado, nota_actualizacion } = await request.json();

    if (!id || !estado) {
      return NextResponse.json(
        { error: 'Faltan campos: id y estado son requeridos' },
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

    const reporte = await db.reporteEmergencia.findUnique({ where: { id } });
    if (!reporte) {
      return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 });
    }

    const updated = await db.reporteEmergencia.update({
      where: { id },
      data: {
        estado,
        notaAdicional: nota_actualizacion
          ? `[ACTUALIZADO] ${nota_actualizacion}\n${reporte.notaAdicional ? `— Anterior: ${reporte.notaAdicional}` : ''}`
          : reporte.notaAdicional,
      },
    });

    const enriched = enrichReporte(updated as unknown as Record<string, unknown>);

    return NextResponse.json({ success: true, reporte: enriched });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── AI Analysis (gracioso — no rompe si el SDK no existe) ─────
async function triggerAiAnalysis(
  reporteId: string,
  data: Record<string, string | undefined>
) {
  try {
    // Importación dinámica: si el SDK no existe (Vercel), falla silenciosamente
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
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
  } catch {
    // SDK no disponible en Vercel o error de IA — no rompe el reporte
    console.log('[AI] Análisis de IA no disponible en este entorno. Reporte guardado sin clasificación de urgencia.');
  }
}