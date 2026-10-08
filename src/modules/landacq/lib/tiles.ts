import type { LonLat, Projector } from './geometry'

export type Basemap = 'none' | 'osm' | 'carto' | 'esri'
export const BASEMAPS: Record<Exclude<Basemap, 'none'>, { label: string; url: (z: number, x: number, y: number) => string; maxZoom: number; credit: string }> = {
  osm: { label: 'خیابانی (OSM)', url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, maxZoom: 19, credit: '© OpenStreetMap contributors' },
  carto: { label: 'روشن و سبک (CARTO)', url: (z, x, y) => `https://${'abc'[(x + y) % 3]}.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`, maxZoom: 19, credit: '© OpenStreetMap contributors © CARTO' },
  esri: { label: 'ماهواره‌ای (Esri)', url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, maxZoom: 18, credit: 'Esri, Maxar, Earthstar Geographics' },
}

const lonToX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z
const latToY = (lat: number, z: number) => {
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180)
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z
}
const xToLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180
const yToLat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI

export interface Tile {
  key: string
  url: string
  x: number
  y: number
  w: number
  h: number
}

/**
 * The slippy-map tiles that cover the visible part of the map, placed in the SVG's own (pre-pan/zoom) coordinates.
 * `view` is the pan/zoom transform applied on top; at most ~64 tiles are ever requested.
 */
export function visibleTiles(proj: Projector, box: { w: number; h: number }, view: { k: number; x: number; y: number }, map: Exclude<Basemap, 'none'>): Tile[] {
  const def = BASEMAPS[map]
  const tl: LonLat = proj.invert([(0 - view.x) / view.k, (0 - view.y) / view.k])
  const br: LonLat = proj.invert([(box.w - view.x) / view.k, (box.h - view.y) / view.k])
  let z = Math.round(Math.log2((proj.pxPerDegLon * view.k * 360) / 256))
  z = Math.max(2, Math.min(def.maxZoom, z))
  for (;;) {
    const x0 = Math.floor(lonToX(tl[0], z)), x1 = Math.floor(lonToX(br[0], z))
    const y0 = Math.floor(latToY(tl[1], z)), y1 = Math.floor(latToY(br[1], z))
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 64 || z <= 2) {
      const out: Tile[] = []
      const n = 2 ** z
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          if (y < 0 || y >= n) continue
          const a = proj([xToLon(x, z), yToLat(y, z)])
          const b = proj([xToLon(x + 1, z), yToLat(y + 1, z)])
          const xi = ((x % n) + n) % n
          out.push({ key: `${map}/${z}/${xi}/${y}`, url: def.url(z, xi, y), x: a[0], y: a[1], w: b[0] - a[0] + 0.6, h: b[1] - a[1] + 0.6 })
        }
      }
      return out
    }
    z--
  }
}
