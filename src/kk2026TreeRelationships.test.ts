import { describe, expect, it } from "vitest";
import { createKk2026Courses, kk2026DottedTreeRelationships } from "../functions/src/kk2026Catalog";

describe("KK 2026 カリキュラムツリーの破線", () => {
  it("元資料の破線20本を、対象科目の推奨先修として登録する", () => {
    const courses = createKk2026Courses();
    const courseById = new Map(courses.map((course) => [course.id, course]));

    expect(kk2026DottedTreeRelationships).toHaveLength(20);
    for (const relationship of kk2026DottedTreeRelationships) {
      expect(courseById.get(relationship.sourceCourseId)).toBeDefined();
      expect(courseById.get(relationship.targetCourseId)?.softPrerequisites).toContain(relationship.sourceCourseId);
    }
  });

  it("破線は登録禁止の実線前提条件へ混在させない", () => {
    const courses = createKk2026Courses();
    const courseById = new Map(courses.map((course) => [course.id, course]));

    for (const relationship of kk2026DottedTreeRelationships) {
      expect(courseById.get(relationship.targetCourseId)?.hardPrerequisites ?? []).not.toContain(relationship.sourceCourseId);
    }
  });
});
