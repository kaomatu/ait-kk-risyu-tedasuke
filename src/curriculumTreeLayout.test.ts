import { describe, expect, it } from "vitest";
import { curriculumTreeCourseIdsFromTree, kk2026TreeCourseLinks, kkCurriculumTree } from "./curriculumTreeLayout";
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
    expect(kkCurriculumTree.height).toBe(2128);
    expect(kkCurriculumTree.areas.some((area) => area.y < 1064)).toBe(true);
    expect(kkCurriculumTree.areas.some((area) => area.y >= 1064)).toBe(true);
    expect(kkCurriculumTree.continuationLines).toHaveLength(4);
  });

  it("places both endpoints of every audited solid and dotted link", () => {
    const visible = new Set(displayedCourseIds);
    for (const link of kk2026TreeCourseLinks) {
      expect(visible.has(link.sourceCourseId), `source: ${link.sourceCourseId}`).toBe(true);
      expect(visible.has(link.targetCourseId), `target: ${link.targetCourseId}`).toBe(true);
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
