import type { PlanItem } from "./types";

/** 時間割に置くため、同じ曜日の連続時限をひとつの表示ブロックにまとめる。 */
export interface PlanScheduleSegment extends PlanItem {
  startPeriod: number;
  span: number;
}

export function createPlanScheduleSegments(items: PlanItem[]): PlanScheduleSegment[] {
  return items.flatMap((item) => {
    const periods = [...new Set(item.offering.periods)].sort((left, right) => left - right);
    if (periods.length === 0) return [];

    const segments: PlanScheduleSegment[] = [];
    let startPeriod = periods[0]!;
    let previousPeriod = startPeriod;

    for (const period of periods.slice(1)) {
      if (period === previousPeriod + 1) {
        previousPeriod = period;
        continue;
      }
      segments.push({ ...item, startPeriod, span: previousPeriod - startPeriod + 1 });
      startPeriod = period;
      previousPeriod = period;
    }
    segments.push({ ...item, startPeriod, span: previousPeriod - startPeriod + 1 });
    return segments;
  });
}
