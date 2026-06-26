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
  fuentes: { sismos: string; noticias: string[]; twitter: boolean; telegram: boolean };
}

// In-memory cache (2 min)
let cache: { data: ApiResponse; ts: number } | null = null;
const CACHE_TTL = 120_000;

// ─── Venezuela bounding box ────────────────────────────────────
// Lat: 0.7 – 12.2, Lon: -73.5 – -59.8
const VZLA = { minLat: 0.7, maxLat: 12.2, minLon: -73.5, maxLon: -59.8 };

function isInVenezuela(lat: number, lon: number): boolean {
  return lat >= VZLA.minLat && lat <= VZLA.maxLat && lon >= VZLA.minLon && lon <= VZLA.maxLon;
}

// ─── USGS Earthquake Feed ──────────────────────────────────────
async function fetchSismos(): Promise<Sismo[]> {
  try {
    const res = await fetch(
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson',
      { next: { revalidate: 120 } }
    );
    if (!res.ok) throw new Error('USGS unavailable');

    const geo = await res.json();
    const sismos: Sismo[] = [];

    for (const f of geo.features) {
      const [lon, lat, depth] = f.geometry.coordinates;
      const mag = f.properties.mag;

      const inVzla = isInVenezuela(lat, lon);
      const significant = mag >= 5.0;
      if (!inVzla && !significant) continue;

      let tipo: Sismo['tipo'] = 'info';
      if (mag >= 6.0) tipo = 'alerta';
      else if (mag >= 4.5 || (inVzla && mag >= 3.5)) tipo = 'moderado';

      sismos.push({
        id: f.id,
        lugar: f.properties.place || 'Sin ubicación',
        magnitud: mag,
        profundidad: Math.round(depth),
        tiempo: f.properties.time,
        url: f.properties.url,
        tipo,
      });
    }

    return sismos.sort((a, b) => {
      if (b.magnitud !== a.magnitud) return b.magnitud - a.magnitud;
      return Number(b.tiempo) - Number(a.tiempo);
    }).slice(0, 20);
  } catch (err) {
    console.error('[Noticias] USGS error:', err instanceof Error ? err.message : err);
    return [];
  }
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

// ─── Twitter / Telegram (ready for future API keys) ───────────
// Add TWITTER_BEARER_TOKEN or TELEGRAM_BOT_TOKEN env vars to activate

async function fetchTweets(): Promise<Noticia[]> {
  // TODO: implement with Twitter API v2 when token is available
  return [];
}

async function fetchTelegram(): Promise<Noticia[]> {
  // TODO: implement with Telegram Bot API when token is available
  return [];
}

// ─── GET Handler ───────────────────────────────────────────────
export async function GET() {
  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return NextResponse.json(cache.data);
    }

    const [sismos, noticias, tweets, telegram] = await Promise.all([
      fetchSismos(),
      fetchNoticias(),
      fetchTweets(),
      fetchTelegram(),
    ]);

    const allNoticias: Noticia[] = [
      ...tweets.map((t) => ({ ...t, fuente: '𝕏 ' + t.fuente })),
      ...telegram.map((t) => ({ ...t, fuente: '✈️ ' + t.fuente })),
      ...noticias,
    ];

    const data: ApiResponse = {
      sismos,
      noticias: allNoticias.slice(0, 30),
      timestamp: new Date().toISOString(),
      fuentes: {
        sismos: 'USGS Earthquake Hazards',
        noticias: RSS_FEEDS.map((f) => f.nombre),
        twitter: !!process.env.TWITTER_BEARER_TOKEN,
        telegram: !!process.env.TELEGRAM_BOT_TOKEN,
      },
    };

    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error';
    console.error('[Noticias API]', message);
    if (cache) return NextResponse.json(cache.data);
    return NextResponse.json({
      sismos: [], noticias: [],
      timestamp: new Date().toISOString(),
      fuentes: { sismos: 'USGS (error)', noticias: [], twitter: false, telegram: false },
    });
  }
}