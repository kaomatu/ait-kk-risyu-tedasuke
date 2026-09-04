import { describe, expect, it } from "vitest";
import { curriculumTreeCourseBounds, curriculumTreeCourseIdsFromTree, kk2026TreeCourseLinks, kkCurriculumTree, kkTreePageTwoOffset } from "./curriculumTreeLayout";
import { createKk2026Courses } from "../functions/src/kk2026Catalog";

describe("KK interactive curriculum tree layout", () => {
  const displayedCourseIds = curriculumTreeCourseIdsFromTree(kkCurriculumTree);
  const courses = createKk2026Courses();

  it("contains only existing courses, without duplicate interactive buttons", () => {
    const catalogIds = new Set(courses.map((course) => course.id));
    expect(displayedCourseIds.length).toBe(new Set(displayedCourseIds).size);
    displayedCourseIds.forEach((courseId) => expect(catalogIds.has(courseId), courseId).toBe(true));
  });

  it("uses one continuous canvas for pages 114–115", () => {
    expect(kkCurriculumTree.height).toBe(2008);
    expect(kkCurriculumTree.areas.some((area) => area.y < 944)).toBe(true);
    expect(kkCurriculumTree.areas.some((area) => area.y >= 944)).toBe(true);
    expect(kkTreePageTwoOffset).toBe(944);
    expect(kkCurriculumTree.continuationLines.length).toBeGreaterThanOrEqual(8);
  });

  it("places both endpoints of every audited solid and dotted link", () => {
    const visible = new Set(displayedCourseIds);
    for (const link of kk2026TreeCourseLinks) {
      expect(visible.has(link.sourceCourseId), `source: ${link.sourceCourseId}`).toBe(true);
      expect(visible.has(link.targetCourseId), `target: ${link.targetCourseId}`).toBe(true);
    }
  });

  it("uses a source-defined SVG route for every audited connection", () => {
    expect(kk2026TreeCourseLinks).toHaveLength(48);
    for (const link of kk2026TreeCourseLinks) {
      expect(link.path, `${link.sourceCourseId} -> ${link.targetCourseId}`).toMatch(/^M\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?(?:\s|$)/);
      expect(link.path).not.toContain("NaN");
      expect(link.sourcePage === 114 || link.sourcePage === 115).toBe(true);
    }
    for (const line of kkCurriculumTree.continuationLines) {
      expect(line.path).toMatch(/^M\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?(?:\s|$)/);
      expect(line.sourcePage === 114 || line.sourcePage === 115).toBe(true);
    }
  });

  it("does not overlap any two independently selectable course buttons", () => {
    const bounds = curriculumTreeCourseBounds(kkCurriculumTree);
    expect(bounds).toHaveLength(displayedCourseIds.length);
    for (let first = 0; first < bounds.length; first += 1) {
      for (let second = first + 1; second < bounds.length; second += 1) {
        const a = bounds[first];
        const b = bounds[second];
        const horizontalOverlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const verticalOverlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        // 帯状のクラスタを等分したときに生じる浮動小数点の誤差は重なりとしない。
        expect(horizontalOverlap > 0.25 && verticalOverlap > 0.25, `${a.courseId} overlaps ${b.courseId}`).toBe(false);
      }
    }
  });

  it("keeps the visual link ledger and planning prerequisite data in exact agreement", () => {
    const linksByTarget = new Map<string, { hard: string[]; soft: string[] }>();
    for (const link of kk2026TreeCourseLinks) {
      const item = linksByTarget.get(link.targetCourseId) ?? { hard: [], soft: [] };
      item[link.kind].push(link.sourceCourseId);
      linksByTarget.set(link.targetCourseId, item);
    }

    for (const course of courses) {
      const expected = linksByTarget.get(course.id) ?? { hard: [], soft: [] };
      expect([...new Set(course.hardPrerequisites ?? [])].sort(), `${course.code} hard`).toEqual([...new Set(expected.hard)].sort());
      expect([...new Set(course.softPrerequisites ?? [])].sort(), `${course.code} soft`).toEqual([...new Set(expected.soft)].sort());
    }
  });
});
