import { describe, expect, it } from "vitest";
import { curriculumTreeCourseIds, kkCurriculumTreePages } from "./curriculumTreeLayout";
import { createKk2026Courses } from "../functions/src/kk2026Catalog";

describe("KK interactive curriculum tree layout", () => {
  const displayedCourseIds = kkCurriculumTreePages.flatMap(curriculumTreeCourseIds);
  const courses = createKk2026Courses();

  it("contains only existing courses, without duplicate interactive buttons", () => {
    const catalogIds = new Set(courses.map((course) => course.id));
    expect(displayedCourseIds.length).toBe(new Set(displayedCourseIds).size);
    displayedCourseIds.forEach((courseId) => expect(catalogIds.has(courseId), courseId).toBe(true));
  });

  it("places both endpoints of every stored prerequisite and recommendation link", () => {
    const visible = new Set(displayedCourseIds);
    for (const course of courses) {
      for (const prerequisiteId of [...(course.hardPrerequisites ?? []), ...(course.softPrerequisites ?? [])]) {
        expect(visible.has(prerequisiteId), `source: ${prerequisiteId}`).toBe(true);
        expect(visible.has(course.id), `target: ${course.id}`).toBe(true);
      }
    }
  });
});
