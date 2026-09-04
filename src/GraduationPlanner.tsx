import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { calculateGraduationPlanProgress, deriveGraduationPlan } from "./planEngine";
import type { Course, Dataset, GraduationPlan, StudentProfile } from "./types";

type RequirementKey = keyof Dataset["policies"]["graduation"];
type Relationship = { from: string; to: string; kind: "hard" | "soft" };
type GraphEdge = Relationship & { startX: number; startY: number; endX: number; endY: number };

const graduationRequirements: Array<{ key: RequirementKey; title: string; description: string }> = [
  { key: "specializedRequired", title: "専門教育・必修", description: "専門教育科目の必修として計上される単位" },
  { key: "specializedElective", title: "専門教育・選択", description: "専門教育科目の選択として計上される単位" },
  { key: "specializedTotal", title: "専門教育・合計", description: "専門教育科目として計上される単位の合計" },
  { key: "generalRequired", title: "総合教育・必修", description: "総合教育科目の必修・選択必修として計上される単位" },
  { key: "generalElective", title: "総合教育・選択", description: "総合教育科目の選択として計上される単位" },
  { key: "generalTotal", title: "総合教育・合計", description: "総合教育科目として計上される単位の合計" },
  { key: "english", title: "英語系", description: "英語系として計上される単位" },
  { key: "total", title: "卒業要件・総計", description: "卒業要件に計上される全区分の単位" },
];

const termColumns = [
  { grade: 1, term: "spring", label: "1年前期" },
  { grade: 1, term: "fall", label: "1年後期" },
  { grade: 2, term: "spring", label: "2年前期" },
  { grade: 2, term: "fall", label: "2年後期" },
  { grade: 3, term: "spring", label: "3年前期" },
  { grade: 3, term: "fall", label: "3年後期" },
  { grade: 4, term: "spring", label: "4年前期" },
  { grade: 4, term: "fall", label: "4年後期" },
] as const;

function isGraduationCourse(course: Course) {
  return course.countForGraduation !== false && course.requirementType !== "non_counting";
}

function coursesForRequirement(dataset: Dataset, key: RequirementKey) {
  return dataset.courses.filter((course) => {
    if (!isGraduationCourse(course)) return false;
    if (key === "total") return true;
    if (key === "english") return course.tags?.includes("english") ?? false;
    if (key === "specializedTotal") return course.category === "specialized";
    if (key === "specializedRequired") return course.category === "specialized" && (course.requirementType === "required" || course.requirementType === "required_elective");
    if (key === "specializedElective") return course.category === "specialized" && (course.requirementType === "elective" || course.requirementType === "required_elective");
    if (key === "generalTotal") return course.category === "general";
    if (key === "generalRequired") return course.category === "general" && (course.requirementType === "required" || course.requirementType === "required_elective");
    return course.category === "general" && (course.requirementType === "elective" || course.requirementType === "required_elective");
  });
}

function requirementLabel(course: Course) {
  if (course.requirementType === "required") return "必修";
  if (course.requirementType === "required_elective") return "選択必修";
  if (course.requirementType === "elective") return "選択";
  return "要件外";
}

function courseCode(course: Course) {
  return course.officialCode === false ? "資料コード未確認" : course.code;
}

function classification(courseId: string, plan: ReturnType<typeof deriveGraduationPlan>) {
  if (plan.targetCourseIds.includes(courseId)) return "target";
  if (plan.requiredCourseIds.includes(courseId)) return "required";
  if (plan.recommendedCourseIds.includes(courseId)) return "recommended";
  return "";
}

function termColumnFor(course: Course) {
  const term = course.recommendedTerm === "full_year" ? "spring" : course.recommendedTerm;
  return termColumns.findIndex((column) => column.grade === course.recommendedGrade && column.term === term);
}

function CourseList({
  courses,
  targetCourseIds,
  completedCourseIds,
  onToggle,
}: {
  courses: Course[];
  targetCourseIds: string[];
  completedCourseIds: string[];
  onToggle: (courseId: string) => void;
}) {
  if (courses.length === 0) return <p className="compact">この区分に計上できる科目は、現在のデータセットにありません。</p>;
  return <div className="requirement-course-list">{courses.map((course) => {
    const selected = targetCourseIds.includes(course.id);
    return <article className="requirement-course-row" key={course.id}>
      <div><span className="course-code">{courseCode(course)}</span><strong>{course.name}</strong><small>{course.credits}単位 / {requirementLabel(course)} / {course.recommendedGrade}年{course.recommendedTerm === "full_year" ? "通年" : course.recommendedTerm === "spring" ? "前期" : "後期"}{completedCourseIds.includes(course.id) ? " / 修得済み" : ""}</small></div>
      <button className={selected ? "secondary-button selected-goal" : "secondary-button"} onClick={() => onToggle(course.id)}>{selected ? "目標から外す" : "目標に追加"}</button>
    </article>;
  })}</div>;
}

export function GraduationPlanner({
  dataset,
  profile,
  savedPlan,
  busy,
  onSave,
}: {
  dataset: Dataset;
  profile: StudentProfile;
  savedPlan: GraduationPlan | null;
  busy: boolean;
  onSave: (plan: GraduationPlan) => Promise<void>;
}) {
  const [targetCourseIds, setTargetCourseIds] = useState<string[]>(savedPlan?.targetCourseIds ?? []);
  const [selectedRequirement, setSelectedRequirement] = useState<RequirementKey | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<GraphEdge[]>([]);

  useEffect(() => {
    setTargetCourseIds(savedPlan?.targetCourseIds ?? []);
  }, [savedPlan?.savedAt, dataset.datasetVersionId]);

  const derived = useMemo(() => deriveGraduationPlan(dataset, targetCourseIds), [dataset, targetCourseIds]);
  const draftPlan = useMemo<GraduationPlan>(() => ({
    schemaVersion: 1,
    datasetVersionId: dataset.datasetVersionId,
    programCode: dataset.program.code,
    ...derived,
    savedAt: savedPlan?.savedAt ?? "",
  }), [dataset, derived, savedPlan?.savedAt]);
  const progress = useMemo(() => calculateGraduationPlanProgress(dataset, profile, derived), [dataset, profile, derived]);
  const coursesByColumn = useMemo(() => termColumns.map((_, index) => dataset.courses
    .filter((course) => termColumnFor(course) === index)
    .sort((a, b) => a.category.localeCompare(b.category) || a.code.localeCompare(b.code, "ja"))), [dataset]);
  const relationships = useMemo<Relationship[]>(() => dataset.courses.flatMap((course) => [
    ...(course.hardPrerequisites ?? []).map((from) => ({ from, to: course.id, kind: "hard" as const })),
    ...(course.softPrerequisites ?? []).map((from) => ({ from, to: course.id, kind: "soft" as const })),
  ]), [dataset]);
  const selectedRequirementDefinition = graduationRequirements.find((item) => item.key === selectedRequirement) ?? null;
  const selectedRequirementCourses = useMemo(() => selectedRequirement ? coursesForRequirement(dataset, selectedRequirement) : [], [dataset, selectedRequirement]);

  useLayoutEffect(() => {
    const root = mapRef.current;
    if (!root) return;
    const updateEdges = () => {
      const rootRect = root.getBoundingClientRect();
      const elements = new Map(Array.from(root.querySelectorAll<HTMLElement>("[data-course-node]")).map((element) => [element.dataset.courseNode!, element]));
      const nextEdges = relationships.flatMap((relationship) => {
        const from = elements.get(relationship.from);
        const to = elements.get(relationship.to);
        if (!from || !to) return [];
        const source = from.getBoundingClientRect();
        const target = to.getBoundingClientRect();
        return [{
          ...relationship,
          startX: source.right - rootRect.left + root.scrollLeft,
          startY: source.top + source.height / 2 - rootRect.top + root.scrollTop,
          endX: target.left - rootRect.left + root.scrollLeft,
          endY: target.top + target.height / 2 - rootRect.top + root.scrollTop,
        }];
      });
      setEdges(nextEdges);
    };
    const frame = window.requestAnimationFrame(updateEdges);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateEdges);
    observer?.observe(root);
    window.addEventListener("resize", updateEdges);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", updateEdges);
    };
  }, [relationships, coursesByColumn]);

  function toggleTarget(courseId: string) {
    setTargetCourseIds((current) => current.includes(courseId) ? current.filter((id) => id !== courseId) : [...current, courseId]);
  }

  async function save() {
    if (draftPlan.targetCourseIds.length === 0) return;
    await onSave(draftPlan);
  }

  return <section className="graduation-planner">
    <section className="planner-header"><div><p className="eyebrow">TOOL 3 / GRADUATION PLAN</p><h1>卒業までの目標を、科目のつながりから決める。</h1><p>取りたい科目を選ぶと、実線の先修条件と破線の推奨順序を辿り、卒業までに見通したい科目を3つの区分に整理します。保存後、ツール2は今学期に該当する科目を自動選択します。</p></div><div className="planner-actions"><button className="primary-button" disabled={busy || draftPlan.targetCourseIds.length === 0} onClick={() => void save()}>{busy ? "保存中…" : "卒業計画を保存"}</button></div></section>

    <section className="graduation-intro section-card"><div><strong>対象の所属</strong><span>{dataset.program.faculty} / {dataset.program.department} / {dataset.program.name}</span></div><div><strong>保存状態</strong><span>{savedPlan ? `保存済み（${new Date(savedPlan.savedAt).toLocaleString("ja-JP")}）` : "未保存"}</span></div><div><strong>選択方法</strong><span>科目カードをクリックして、卒業までの目標に追加・解除</span></div></section>

    <section className="section-card curriculum-map-card"><div className="section-heading"><div><p className="eyebrow">CONNECTED CURRICULUM TREE</p><h2>卒業までのカリキュラムツリー</h2></div><span className="legend"><i className="legend-target" />目標 <i className="legend-required-link" />必要な先修 <i className="legend-recommended-link" />推奨 <i className="legend-hard-line" />実線 <i className="legend-soft-line" />破線</span></div><p className="compact">矢印は前の科目から次の科目です。実線は単位修得が必要な先修条件、破線は履修を推奨する順序です。横にスクロールして全学年を確認できます。</p>
      <div className="curriculum-map-scroll"><div className="curriculum-map-canvas" ref={mapRef}>
        <svg className="curriculum-links" width="100%" height="100%" aria-hidden="true"><defs><marker id="hard-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" /></marker><marker id="soft-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" /></marker></defs>{edges.map((edge) => { const curve = Math.max(28, Math.abs(edge.endX - edge.startX) * .38); return <path key={`${edge.kind}-${edge.from}-${edge.to}`} className={edge.kind === "hard" ? "hard-link" : "soft-link"} d={`M ${edge.startX} ${edge.startY} C ${edge.startX + curve} ${edge.startY}, ${edge.endX - curve} ${edge.endY}, ${edge.endX} ${edge.endY}`} markerEnd={edge.kind === "hard" ? "url(#hard-arrow)" : "url(#soft-arrow)"} />; })}</svg>
        <div className="curriculum-map-grid">{termColumns.map((column, index) => <section className="map-column" key={`${column.grade}-${column.term}`}><h3>{column.label}</h3>{coursesByColumn[index]!.map((course) => { const kind = classification(course.id, derived); const completed = profile.completedCourseIds.includes(course.id); return <button key={course.id} data-course-node={course.id} className={`map-course ${kind} ${course.requirementType} ${completed ? "completed" : ""}`} onClick={() => toggleTarget(course.id)}><span className="course-code">{courseCode(course)}</span><strong>{course.name}</strong><small>{course.credits}単位 / {requirementLabel(course)}{course.recommendedTerm === "full_year" ? " / 通年" : ""}</small>{kind === "target" && <em>目標</em>}{kind === "required" && <em>必要な先修</em>}{kind === "recommended" && <em>推奨</em>}{completed && <i>修得済み</i>}</button>; })}</section>)}</div>
      </div></div>
    </section>

    <section className="plan-classification-grid">
      <article className="section-card plan-classification target"><p className="eyebrow">1. TARGET COURSES</p><h2>取りたい・やりたい科目</h2><p>{derived.targetCourseIds.length}科目。あなたが選んだ卒業までの目標です。</p><PlanCourseNames dataset={dataset} ids={derived.targetCourseIds} empty="カリキュラムツリーから科目を選んでください。" /></article>
      <article className="section-card plan-classification required"><p className="eyebrow">2. REQUIRED PREREQUISITES</p><h2>目標のために必要な科目</h2><p>{derived.requiredCourseIds.length}科目。実線の先修条件を再帰的に辿っています。</p><PlanCourseNames dataset={dataset} ids={derived.requiredCourseIds} empty="選んだ目標科目に、未登録の実線先修条件はありません。" /></article>
      <article className="section-card plan-classification recommended"><p className="eyebrow">3. RECOMMENDED PREPARATION</p><h2>取っておいた方がよい科目</h2><p>{derived.recommendedCourseIds.length}科目。破線の推奨順序を再帰的に辿っています。</p><PlanCourseNames dataset={dataset} ids={derived.recommendedCourseIds} empty="現在の登録データには、選んだ目標から辿れる破線の推奨関係がありません。推測で補完はしていません。" /></article>
    </section>

    <section className="section-card graduation-requirements"><div className="section-heading"><div><p className="eyebrow">GRADUATION REQUIREMENTS</p><h2>卒業要件の現在地</h2></div><span className="pill">修得済み + この卒業計画</span></div><p className="compact">区分を押すと、その区分に計上できる科目の一覧を表示します。一つの選択必修科目の計上先は、実際の修得状況に応じて確定します。</p><div className="graduation-requirement-grid">{graduationRequirements.map((requirement) => { const value = progress[requirement.key === "total" ? "graduationTotal" : requirement.key]; const target = dataset.policies.graduation[requirement.key]; const remaining = Math.max(0, target - value); const percent = Math.min(100, target === 0 ? 0 : Math.round(value / target * 100)); return <button key={requirement.key} className={selectedRequirement === requirement.key ? "graduation-requirement active" : "graduation-requirement"} onClick={() => setSelectedRequirement((current) => current === requirement.key ? null : requirement.key)}><span>{requirement.title}</span><strong>{value} / {target} 単位</strong><small>あと {remaining} 単位</small><i><b style={{ width: `${percent}%` }} /></i></button>; })}</div>
      {selectedRequirementDefinition && <section className="requirement-detail"><div><p className="eyebrow">COURSES FOR {selectedRequirementDefinition.title}</p><h3>{selectedRequirementDefinition.title}に計上できる科目</h3><p>{selectedRequirementDefinition.description}。目標に追加すると、関連する実線・破線の科目も上の3区分へ反映されます。</p></div><CourseList courses={selectedRequirementCourses} targetCourseIds={derived.targetCourseIds} completedCourseIds={profile.completedCourseIds} onToggle={toggleTarget} /></section>}
    </section>
  </section>;
}

function PlanCourseNames({ dataset, ids, empty }: { dataset: Dataset; ids: string[]; empty: string }) {
  const courses = ids.map((id) => dataset.courses.find((course) => course.id === id)).filter((course): course is Course => Boolean(course));
  return courses.length > 0 ? <ul className="plan-course-chips">{courses.map((course) => <li key={course.id}><span>{courseCode(course)}</span>{course.name}<b>{course.credits}単位</b></li>)}</ul> : <p className="empty-plan-group">{empty}</p>;
}
