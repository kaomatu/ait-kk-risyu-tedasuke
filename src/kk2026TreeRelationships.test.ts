import { describe, expect, it } from "vitest";
import { createKk2026Courses, kk2026DottedTreeRelationships } from "../functions/src/kk2026Catalog";

describe("KK 2026 カリキュラムツリーの破線", () => {
  it("レビュー済みの破線21本を、対象科目の推奨先修として登録する", () => {
    const courses = createKk2026Courses();
    const courseById = new Map(courses.map((course) => [course.id, course]));

    expect(kk2026DottedTreeRelationships).toHaveLength(21);
    for (const relationship of kk2026DottedTreeRelationships) {
      expect(courseById.get(relationship.sourceCourseId)).toBeDefined();
      expect(courseById.get(relationship.targetCourseId)?.softPrerequisites).toContain(relationship.sourceCourseId);
    }
  });

  it("表で両方が明示された数値計算←微分積分Ⅱ以外は、破線を実線前提条件へ混在させない", () => {
    const courses = createKk2026Courses();
    const courseById = new Map(courses.map((course) => [course.id, course]));

    const allowedBoth = new Set(["ait.kk.K2059->ait.kk.K2044"]);
    for (const relationship of kk2026DottedTreeRelationships) {
      const key = `${relationship.sourceCourseId}->${relationship.targetCourseId}`;
      expect((courseById.get(relationship.targetCourseId)?.hardPrerequisites ?? []).includes(relationship.sourceCourseId)).toBe(allowedBoth.has(key));
    }
  });

  it("レビュー済みの関係修正と後続の明示追加を、実線と破線へ正確に反映する", () => {
    const courses = createKk2026Courses();
    const byId = new Map(courses.map((course) => [course.id, course]));
    const hard = (target: string) => byId.get(target)?.hardPrerequisites ?? [];
    const soft = (target: string) => byId.get(target)?.softPrerequisites ?? [];

    expect(hard("ait.kk.K1013")).toContain("ait.kk.K1019");
    expect(soft("ait.kk.K2063")).toContain("ait.kk.K1020");
    expect(soft("ait.kk.K2063")).not.toContain("ait.kk.K2059");
    expect(hard("ait.kk.K2017")).toContain("ait.kk.K2061");
    expect(soft("ait.kk.K2017")).toContain("ait.kk.K2059");
    expect(hard("ait.kk.K2044")).toEqual(expect.arrayContaining(["ait.kk.K2061", "ait.kk.K2059"]));
    expect(soft("ait.kk.K2044")).toContain("ait.kk.K2059");
    expect(hard("ait.kk.K2082")).toContain("ait.kk.K2061");
    expect(hard("ait.kk.K2118")).toEqual(expect.arrayContaining(["ait.kk.K2061", "ait.kk.K2059", "ait.kk.K2087"]));
    expect(soft("ait.kk.K2089")).toContain("ait.kk.K2022");
    expect(soft("ait.kk.K3002")).not.toContain("ait.kk.K2022");
    expect(hard("ait.kk.K3005")).toContain("ait.kk.K2083");
    expect(soft("ait.kk.K3005")).not.toContain("ait.kk.K2022");
    expect(soft("ait.kk.K1015")).toContain("ait.kk.K2118");
    expect(soft("ait.kk.K3004")).not.toContain("ait.kk.K2118");
    expect(soft("ait.kk.K3003")).not.toEqual(expect.arrayContaining(["ait.kk.K2069", "ait.kk.K2118"]));
  });
});
