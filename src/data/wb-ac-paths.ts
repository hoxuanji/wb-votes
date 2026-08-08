// Rows live in data/seed/wb-ac-paths.json (168 KB of SVG path data).
import raw from '../../data/seed/wb-ac-paths.json';

export type AcPath = { id: string; acNo: number; path: string; centroid: { x: number; y: number } };

export const wbAcPaths = raw as AcPath[];

export const AC_MAP_WIDTH = 400;
export const AC_MAP_HEIGHT = 580;
