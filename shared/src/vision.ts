import { GAME_CONFIG } from "./config.js";
import { distance } from "./math.js";
import type { ObstacleData, Role, Vec2 } from "./types.js";

function pointInsideRect(point: Vec2, rect: ObstacleData): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

function ccw(a: Vec2, b: Vec2, c: Vec2): boolean {
  return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

function lineIntersectsRect(start: Vec2, end: Vec2, rect: ObstacleData): boolean {
  if (pointInsideRect(start, rect) || pointInsideRect(end, rect)) {
    return true;
  }

  const topLeft = { x: rect.x, y: rect.y };
  const topRight = { x: rect.x + rect.w, y: rect.y };
  const bottomLeft = { x: rect.x, y: rect.y + rect.h };
  const bottomRight = { x: rect.x + rect.w, y: rect.y + rect.h };

  return (
    segmentsIntersect(start, end, topLeft, topRight) ||
    segmentsIntersect(start, end, topRight, bottomRight) ||
    segmentsIntersect(start, end, bottomRight, bottomLeft) ||
    segmentsIntersect(start, end, bottomLeft, topLeft)
  );
}

export function getVisionRadius(role: Role | "npc"): number {
  if (role === "lulu") {
    return GAME_CONFIG.vision.lulu;
  }

  if (role === "springtrap") {
    return GAME_CONFIG.vision.springtrap;
  }

  return GAME_CONFIG.vision.npc;
}

export function hasLineOfSight(start: Vec2, end: Vec2, obstacles: ObstacleData[]): boolean {
  for (const obstacle of obstacles) {
    if (obstacle.blocksSight && lineIntersectsRect(start, end, obstacle)) {
      return false;
    }
  }

  return true;
}

export function canSeePoint(start: Vec2, end: Vec2, radius: number, obstacles: ObstacleData[]): boolean {
  if (distance(start, end) > radius) {
    return false;
  }

  return hasLineOfSight(start, end, obstacles);
}
