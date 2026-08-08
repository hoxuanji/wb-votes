// Rows live in data/seed/wb-districts.json.
import raw from '../../data/seed/wb-districts.json';

export const wbDistrictPaths = raw as Array<{ name: string; path: string; centroid: { x: number; y: number } }>;

export const MAP_WIDTH = 400;
export const MAP_HEIGHT = 580;
