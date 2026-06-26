import { NextResponse } from 'next/server';
import Parser from 'rss-parser';

// ─── Types ─────────────────────────────────────────────────────
interface Sismo {
  id: string;
  lugar: string;
  magnitud: number;
  profundidad: number;
  tiempo: string;
  url: string;
  tipo: 'alerta' | 'moderado' | 'info';
  fuente: string;
  nuevo: boolean; // true si appeared en los últimos 15 min
}

interface Noticia {
  id: string;
  titulo: string;
  fuente: string;
  enlace: string;
  resumen: string | null;
  fecha: string;
}

interface ApiResponse {
  sismos: Sismo[];
  noticias: Noticia[];
  timestamp: string;
  fuentes: { sismos: string[]; noticias: string[]; twitter: boolean; telegram: boolean };
}

// Cache: sismos cada 30s (tiempo real), noticias cada 5 min
let cacheSismos: { data: Sismo[]; ts: number } | null = null;
let cacheNoticias: { data: Noticia[]; ts: number } | null = null;
const CACHE_SISMOS_TTL = 30_000;   // 30 segundos para sismos
const CACHE_NOTICIAS_TTL = 300_000; // 5 minutos para noticias

// ─── Venezuela bounding box ────────────────────────────────────
const VZLA = { minLat: 0.7, maxLat: 12.2, minLon: -73.5, maxLon: -59.8 };

// Región del Caribe norte (tsunamis que pueden afectar VE)
const CARIBE = { minLat: 5, maxLat: 20, minLon: -85, maxLon: -55 };

function isInVenezuela(lat: number, lon: number): boolean {
  return lat >= VZLA.minLat && lat <= VZLA.maxLat && lon >= VZLA.minLon && lon <= VZLA.maxLon;
}

function isInCaribe(lat: number, lon: number): boolean {
  return lat >= CARIBE.minLat && lat <= CARIBE.maxLat && lon >= CARIBE.minLon && lon <= CARIBE.maxLon;
}

function classifySismo(mag: number, inVzla: boolean, inCaribe: boolean): Sismo['tipo'] {
  if (mag >= 7.0) return 'alerta';                    // Mega-sismo
  if (mag >= 6.0 && (inVzla || inCaribe)) return 'alerta'; // Tsunami potencial
  if (mag >= 4.5 || (inVzla && mag >= 3.0)) return 'moderado';
  return 'info';
}

// ─── Parse earthquake GeoJSON from any source ──────────────────
function parseGeoJsonFeatures(features: Array<Record<string, unknown>>, source: string): Sismo[] {
  const now = Date.now();
  const sismos: Sismo[] = [];

  for (const f of features) {
    const props = f.properties as Record<string, unknown>;
    const geom = f.geometry as { coordinates: [number, number, number] };
    const [lon, lat, depth] = geom.coordinates;
    const mag = props.mag as number;

    const inVzla = isInVenezuela(lat, lon);
    const inCaribe = isInCaribe(lat, lon);

    // Include: Venezuela, Caribe cercano, o cualquier M5.5+ global
    if (!inVzla && !inCaribe && mag < 5.5) continue;
    // Excluir muy lejanos sin importancia
    if (!inVzla && !inCaribe && mag < 6.0) continue;

    const tipo = classifySismo(mag, inVzla, inCaribe);
    const eventTime = Number(props.time);

    sismos.push({
      id: f.id as string,
      lugar: (props.place as string) || 'Sin ubicación',
      magnitud: mag,
      profundidad: Math.round(depth),
      tiempo: props.time as string,
      url: props.url as string,
      tipo,
      fuente: source,
      nuevo: (now - eventTime) < 900_000, // "nuevo" si < 15 min de ocurrido
    });
  }

  return sismos;
}

// ─── USGS: Feed de ÚLTIMA HORA (casi tiempo real) ─────────────
async function fetchUSGS_Hour(): Promise<Sismo[]> {
  try {
    const res = await fetch(
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson',
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) throw new Error(`USGS hour: ${res.status}`);
    const geo = await res.json();
    return parseGeoJsonFeatures(geo.features, 'USGS');
  } catch (err) {
    console.error('[Sismos] USGS hour error:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ─── USGS: Feed del día (respaldo si no hay recientes) ────────
async function fetchUSGS_Day(): Promise<Sismo[]> {
  try {
    const res = await fetch(
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) throw new Error(`USGS day: ${res.status}`);
    const geo = await res.json();
    return parseGeoJsonFeatures(geo.features, 'USGS');
  } catch (err) {
    console.error('[Sismos] USGS day error:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ─── EMSC: Servicio Europeo — más rápido para el Caribe ───────
async function fetchEMSC(): Promise<Sismo[]> {
  try {
    // EMSC provides last hour significant earthquakes
    const res = await fetch(
      'https://www.seismicportal.eu/fdsnws/event/1/query?format=geojson&minmag=3&limit=50&orderby=time-desc',
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) throw new Error(`EMSC: ${res.status}`);
    const geo = await res.json();

    // EMSC format is slightly different from USGS
    const features = geo.features.map((f: Record<string, unknown>) => ({
      id: f.id || `emsc-${(f.properties as Record<string, unknown>)?.evid || Math.random()}`,
      properties: {
        place: (f.properties as Record<string, unknown>)?.flynn_region || (f.properties as Record<string, unknown>)?.region || 'EMSC',
        mag: (f.properties as Record<string, unknown>)?.mag || 0,
        time: (f.properties as Record<string, unknown>)?.time ? new Date((f.properties as Record<string, unknown>).time as string).getTime() : 0,
        url: `https://www.seismicportal.eu/eventinfo/${f.id}`,
      },
      geometry: f.geometry,
    }));

    return parseGeoJsonFeatures(features, 'EMSC');
  } catch (err) {
    console.error('[Sismos] EMSC error:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ─── Consolidar sismos de todas las fuentes ────────────────────
async function fetchAllSismos(): Promise<Sismo[]> {
  // Parallel fetch de las 3 fuentes
  const [hour, day, emsc] = await Promise.all([
    fetchUSGS_Hour(),
    fetchUSGS_Day(),
    fetchEMSC(),
  ]);

  // Merge y deduplicar por ID
  const seen = new Map<string, Sismo>();
  for (const s of [...hour, ...emsc, ...day]) {
    const existing = seen.get(s.id);
    if (!existing) {
      seen.set(s.id, s);
    } else {
      // Keep the one marked as "nuevo" or with more detail
      if (s.nuevo && !existing.nuevo) seen.set(s.id, s);
    }
  }

  // Sort: nuevos primero, luego por magnitud
  return Array.from(seen.values()).sort((a, b) => {
    // Nuevos van primero
    if (a.nuevo !== b.nuevo) return a.nuevo ? -1 : 1;
    // Luego por magnitud
    if (b.magnitud !== a.magnitud) return b.magnitud - a.magnitud;
    return Number(b.tiempo) - Number(a.tiempo);
  }).slice(0, 25);
}

// ─── RSS News ──────────────────────────────────────────────────
const RSS_FEEDS: { url: string; nombre: string }[] = [
  { url: 'https://www.el-nacional.com/feed/', nombre: 'El Nacional' },
  { url: 'https://runrun.es/rss/', nombre: 'Runrunes' },
  { url: 'https://www.noticias24.com/feed/', nombre: 'Noticias24' },
];

const DISASTER_KEYWORDS = [
  'sismo', 'terremoto', 'emergencia', 'desastre', 'venezuela',
  'alerta', 'evacuación', 'rescate', 'funvisis', 'inundación',
  'derrumbe', 'tormenta', 'huracán', 'precursor', 'tremor',
  'maremoto', 'tsunami', 'sismicidad', 'falla',
];

async function fetchNoticias(): Promise<Noticia[]> {
  const parser = new Parser({
    timeout: 8000,
    headers: { 'User-Agent': 'EmergenciaVE/1.0' },
  });

  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      try {
        const parsed = await parser.parseURL(feed.url);
        return parsed.items
          .filter((item) => {
            const text = `${item.title || ''} ${item.contentSnippet || ''}`.toLowerCase();
            return (
              text.includes('venezuela') ||
              DISASTER_KEYWORDS.some((kw) => text.includes(kw))
            );
          })
          .slice(0, 10)
          .map((item) => ({
            id: `rss-${Buffer.from(item.link || item.title || '').toString('base64url').slice(0, 20)}`,
            titulo: item.title || 'Sin título',
            fuente: feed.nombre,
            enlace: item.link || '#',
            resumen: item.contentSnippet?.slice(0, 180) || null,
            fecha: item.isoDate || new Date().toISOString(),
          }));
      } catch (err) {
        console.error(`[Noticias] RSS ${feed.nombre}:`, err instanceof Error ? err.message : err);
        return [];
      }
    })
  );

  const all: Noticia[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }

  const seen = new Set<string>();
  return all
    .filter((n) => {
      const key = n.titulo.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    .slice(0, 30);
}

// ─── Twitter / Telegram (listo para claves API) ───────────────
async function fetchTweets(): Promise<Noticia[]> {
  return [];
}

// ─── Telegram Bot Integration ─────────────────────────────
interface TgMessage {
  message_id: number;
  date: number;
  text?: string;
  caption?: string;
  from?: { first_name?: string; last_name?: string; username?: string };
  chat?: { title?: string; type?: string; username?: string };
  photo?: Array<{ file_id: string; file_size?: number }>;
  forward_from_chat?: { title?: string; username?: string };
}

// Cache en memoria: acumula mensajes de Telegram para todos los usuarios
let telegramMessages: Noticia[] = [];
let telegramOffset = 0;
const TELEGRAM_MAX_MESSAGES = 50;
let telegramFetching = false; // Lock para evitar llamadas concurrentes

async function fetchTelegram(): Promise<Noticia[]> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return [];

  // Si ya hay una llamada en curso, devolver cache actual
  if (telegramFetching) return telegramMessages;
  telegramFetching = true;

  try {
    const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${telegramOffset}&limit=100&allowed_updates=["message","channel_post"]&timeout=0`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      // 409 = conflicto de polling concurrente, ignorar silenciosamente
      if (res.status !== 409) {
        console.error('[Noticias] Telegram API:', res.status);
      }
      return telegramMessages;
    }
    const json = await res.json();

    if (json.ok && json.result?.length > 0) {
      const newMessages: Noticia[] = [];

      for (const update of json.result) {
        const msg: TgMessage = update.message || update.channel_post;
        if (!msg) continue;

        // Extraer texto del mensaje o caption de imagen/video
        const text = msg.text || msg.caption || '';
        if (!text.trim()) continue;

        // Filtrar mensajes de sistema (/start, /help, etc.)
        if (text.startsWith('/') && text.length < 30) continue;

        // Nombre del remitente o canal
        const senderName = msg.forward_from_chat?.title
          || msg.chat?.title
          || [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ')
          || 'Telegram';

        const sourcePrefix = msg.chat?.type === 'channel' ? '📢' : '💬';

        newMessages.push({
          id: `tg-${msg.message_id}-${msg.date}`,
          titulo: text.slice(0, 200),
          fuente: `${sourcePrefix} ${senderName}`,
          enlace: msg.chat?.username
            ? `https://t.me/${msg.chat.username}/${msg.message_id}`
            : '#',
          resumen: text.length > 200 ? text.slice(200, 350) : null,
          fecha: new Date(msg.date * 1000).toISOString(),
        });

        // Actualizar offset para no releer
        telegramOffset = update.update_id + 1;
      }

      // Acumular al inicio (más nuevos primero)
      telegramMessages = [...newMessages, ...telegramMessages]
        .slice(0, TELEGRAM_MAX_MESSAGES);
    }

    return telegramMessages;
  } catch (err) {
    console.error('[Noticias] Telegram:', err instanceof Error ? err.message : err);
    return telegramMessages;
  } finally {
    telegramFetching = false;
  }
}

// ─── GET Handler ───────────────────────────────────────────────
export async function GET() {
  const now = Date.now();

  try {
    // Sismos: caché de 30s para casi tiempo real
    let sismos: Sismo[] = [];
    if (cacheSismos && now - cacheSismos.ts < CACHE_SISMOS_TTL) {
      sismos = cacheSismos.data;
    } else {
      sismos = await fetchAllSismos();
      cacheSismos = { data: sismos, ts: now };
    }

    // Telegram: siempre fresco (usa su propio cache interno)
    const tgMsgs = await fetchTelegram();

    // Noticias RSS: caché de 5 min
    let noticias: Noticia[] = [];
    if (cacheNoticias && now - cacheNoticias.ts < CACHE_NOTICIAS_TTL) {
      noticias = cacheNoticias.data;
    } else {
      const rss = await fetchNoticias();
      cacheNoticias = { data: rss, ts: now };
    }

    // Combinar: Telegram primero (más rápido), luego RSS
    const combined = [
      ...tgMsgs,
      ...noticias,
    ].slice(0, 40);

    return NextResponse.json({
      sismos,
      noticias: combined,
      timestamp: new Date().toISOString(),
      fuentes: {
        sismos: ['USGS (1h + 24h)', 'EMSC'],
        noticias: RSS_FEEDS.map((f) => f.nombre),
        twitter: !!process.env.TWITTER_BEARER_TOKEN,
        telegram: !!process.env.TELEGRAM_BOT_TOKEN,
      },
    });
  } catch (error: unknown) {
    console.error('[Noticias API]', error instanceof Error ? error.message : error);
    const sismos = cacheSismos?.data || [];
    const fallback = [...telegramMessages, ...(cacheNoticias?.data || [])];
    return NextResponse.json({
      sismos, noticias: fallback,
      timestamp: new Date().toISOString(),
      fuentes: { sismos: ['USGS', 'EMSC'], noticias: RSS_FEEDS.map((f) => f.nombre), twitter: false, telegram: !!process.env.TELEGRAM_BOT_TOKEN },
    });
  }
}