import { canUseOffering } from "./planEngine";
import type { Course, StudentProfile } from "./types";

export type CoursePickerTermScope = "current" | "all";

export interface CoursePickerFilters {
  grade: number;
  termScope: CoursePickerTermScope;
  query: string;
  /** 今期外の将来目標・自動選択済み科目を、絞り込み中にも見失わないためのID。 */
  selectedCourseIds: string[];
}

/**
 * ツール2の科目選択欄に表示する科目を返す。
 * 通常は「今期に開講する、指定年次の科目」へ絞るが、既に選んだ科目は
 * 配当学期外でも残して、利用者が解除・確認できるようにする。
 */
export function filterPlannerCoursePicker(courses: Course[], profile: StudentProfile, filters: CoursePickerFilters) {
  const selected = new Set(filters.selectedCourseIds);
  const normalizedQuery = filters.query.trim().toLocaleLowerCase("ja-JP");

  return courses
    .filter((course) => course.recommendedGrade === filters.grade)
    .filter((course) => filters.termScope === "all"
      || selected.has(course.id)
      || course.offerings.some((offering) => canUseOffering(course, offering, profile)))
    .filter((course) => selected.has(course.id) || !normalizedQuery || `${course.code} ${course.name}`.toLocaleLowerCase("ja-JP").includes(normalizedQuery))
    .sort((a, b) => a.category.localeCompare(b.category) || a.code.localeCompare(b.code, "ja"));
}
