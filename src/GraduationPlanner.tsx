import { useEffect, useMemo, useState } from "react";
import { curriculumTreeCourseIds, kkCurriculumTreePages, kkTreeTerms, type CurriculumTreePage, type TreeCoursePlacement, type TreePlacement } from "./curriculumTreeLayout";
import { calculateGraduationPlanProgress, deriveGraduationPlan } from "./planEngine";
import type { Course, Dataset, GraduationPlan, StudentProfile } from "./types";

type RequirementKey = keyof Dataset["policies"]["graduation"];

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

type TreeCourseState = "target" | "required" | "recommended" | "completed" | "default";

function displayTreeCourseName(course: Course) {
  // 元図の見た目を保つため、科目コードはボタンのラベルには含めない。
  return course.name;
}

function treeCourseState(courseId: string, targetCourseIds: string[], requiredCourseIds: string[], recommendedCourseIds: string[], completedCourseIds: string[]): TreeCourseState {
  if (targetCourseIds.includes(courseId)) return "target";
  if (requiredCourseIds.includes(courseId)) return "required";
  if (recommendedCourseIds.includes(courseId)) return "recommended";
  if (completedCourseIds.includes(courseId)) return "completed";
  return "default";
}

function linkPath(source: TreeCoursePlacement, target: TreeCoursePlacement) {
  const sourceWidth = source.width ?? 116;
  const targetWidth = target.width ?? 116;
  const sourceHeight = source.height ?? 34;
  const targetHeight = target.height ?? 34;
  const sourceToRight = source.x + sourceWidth / 2 <= target.x + targetWidth / 2;
  const startX = sourceToRight ? source.x + sourceWidth : source.x;
  const endX = sourceToRight ? target.x : target.x + targetWidth;
  const startY = source.y + sourceHeight / 2;
  const endY = target.y + targetHeight / 2;
  const middleX = Math.round((startX + endX) / 2);
  return `M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}`;
}

function TreeCourseButton({
  course,
  placement,
  state,
  selected,
  onToggle,
  compact = false,
}: {
  course: Course;
  placement?: TreeCoursePlacement;
  state: TreeCourseState;
  selected: boolean;
  onToggle: (courseId: string) => void;
  compact?: boolean;
}) {
  const position = placement ? { left: placement.x, top: placement.y, width: placement.width ?? 116, height: placement.height ?? 34 } : undefined;
  const stateDescription = state === "target" ? "目標として選択中" : state === "required" ? "目標のために必要" : state === "recommended" ? "取っておいた方がよい" : state === "completed" ? "修得済み" : "未選択";
  return <button
    type="button"
    className={`interactive-tree-course ${compact ? "compact" : ""}`}
    data-requirement={course.requirementType}
    data-state={state}
    style={position}
    aria-pressed={selected}
    aria-label={`${courseCode(course)} ${course.name}、${stateDescription}。${selected ? "目標から外す" : "目標に追加"}`}
    title={`${courseCode(course)} ${course.name}（${stateDescription}）`}
    onClick={() => onToggle(course.id)}
  ><span>{displayTreeCourseName(course)}</span>{state !== "default" && <i aria-hidden="true">{state === "target" ? "●" : state === "required" ? "!" : state === "recommended" ? "◌" : "✓"}</i>}</button>;
}

function InteractiveTreePage({
  page,
  courses,
  targetCourseIds,
  requiredCourseIds,
  recommendedCourseIds,
  completedCourseIds,
  onToggle,
}: {
  page: CurriculumTreePage;
  courses: Map<string, Course>;
  targetCourseIds: string[];
  requiredCourseIds: string[];
  recommendedCourseIds: string[];
  completedCourseIds: string[];
  onToggle: (courseId: string) => void;
}) {
  const placementsByCourseId = new Map(page.placements
    .filter((placement): placement is TreeCoursePlacement => placement.type === "course")
    .map((placement) => [placement.courseId, placement]));
  const links = [...courses.values()].flatMap((target) => [
    ...(target.hardPrerequisites ?? []).map((sourceCourseId) => ({ sourceCourseId, targetCourseId: target.id, type: "hard" as const })),
    ...(target.softPrerequisites ?? []).map((sourceCourseId) => ({ sourceCourseId, targetCourseId: target.id, type: "soft" as const })),
  ]).filter((link) => placementsByCourseId.has(link.sourceCourseId) && placementsByCourseId.has(link.targetCourseId));

  function renderPlacement(placement: TreePlacement, index: number) {
    if (placement.type === "course") {
      const course = courses.get(placement.courseId);
      if (!course) return null;
      return <TreeCourseButton key={placement.courseId} course={course} placement={placement} state={treeCourseState(course.id, targetCourseIds, requiredCourseIds, recommendedCourseIds, completedCourseIds)} selected={targetCourseIds.includes(course.id)} onToggle={onToggle} />;
    }
    const items = placement.courseIds.map((courseId) => courses.get(courseId)).filter((course): course is Course => Boolean(course));
    if (items.length === 0) return null;
    return <div key={`cluster-${index}`} className={`interactive-tree-cluster ${placement.compact ? "compact" : ""}`} style={{ left: placement.x, top: placement.y, width: placement.width, height: placement.height }}>
      {items.map((course) => <TreeCourseButton key={course.id} course={course} compact state={treeCourseState(course.id, targetCourseIds, requiredCourseIds, recommendedCourseIds, completedCourseIds)} selected={targetCourseIds.includes(course.id)} onToggle={onToggle} />)}
    </div>;
  }

  return <section className="interactive-tree-page" aria-label={`カリキュラムツリー: ${page.title}`}>
    <h3>{page.title}</h3>
    <div className="interactive-tree-scroll">
      <div className="interactive-tree-canvas" style={{ height: page.height }}>
        {page.showTerms && <div className="interactive-tree-terms" aria-label="標準履修学年・学期">{kkTreeTerms.map((term) => <div key={term.label} style={{ left: term.x, width: term.width }}>{term.label.split("\n").map((line) => <span key={line}>{line}</span>)}</div>)}</div>}
        {kkTreeTerms.map((term) => <i key={term.label} className="interactive-tree-column" style={{ left: term.x }} aria-hidden="true" />)}
        {page.areas.map((area) => <section key={`${area.title}-${area.y}`} className={`interactive-tree-area ${area.tone === "sub" ? "sub" : ""}`} style={{ left: area.x, top: area.y, width: area.width, height: area.height }} aria-label={area.title}><div><strong>{area.title}</strong>{area.description && <p>{area.description}</p>}</div></section>)}
        <svg className="interactive-tree-links" viewBox={`0 0 1506 ${page.height}`} role="presentation" aria-hidden="true"><defs><marker id={`${page.id}-hard-arrow`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" /></marker><marker id={`${page.id}-soft-arrow`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" /></marker></defs>{links.map((link) => <path key={`${link.type}-${link.sourceCourseId}-${link.targetCourseId}`} className={link.type === "hard" ? "hard-link" : "soft-link"} markerEnd={`url(#${page.id}-${link.type}-arrow)`} d={linkPath(placementsByCourseId.get(link.sourceCourseId)!, placementsByCourseId.get(link.targetCourseId)!)} />)}</svg>
        <div className="interactive-tree-nodes">{page.placements.map(renderPlacement)}</div>
      </div>
    </div>
  </section>;
}

/** 元図と同じ配置をコードで再構成し、各科目を直接選択できるカリキュラムツリー。 */
function CurriculumTreeReference({
  dataset,
  profile,
  targetCourseIds,
  requiredCourseIds,
  recommendedCourseIds,
  onToggle,
}: {
  dataset: Dataset;
  profile: StudentProfile;
  targetCourseIds: string[];
  requiredCourseIds: string[];
  recommendedCourseIds: string[];
  onToggle: (courseId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("ja-JP");
  const matches = useMemo(() => dataset.courses
    .filter((course) => {
      if (!normalizedQuery) return targetCourseIds.includes(course.id);
      return `${course.code} ${course.name}`.toLocaleLowerCase("ja-JP").includes(normalizedQuery);
    })
    .sort((a, b) => a.recommendedGrade - b.recommendedGrade || a.code.localeCompare(b.code, "ja"))
    .slice(0, 30), [dataset, normalizedQuery, targetCourseIds]);
  const courses = useMemo(() => new Map(dataset.courses.map((course) => [course.id, course])), [dataset]);
  const isKkReferenceTree = dataset.program.code === "KK";
  const displayedCourseIds = useMemo(() => new Set(kkCurriculumTreePages.flatMap(curriculumTreeCourseIds)), []);

  return <section className="section-card curriculum-reference-card">
    <div className="section-heading"><div><p className="eyebrow">INTERACTIVE CURRICULUM TREE</p><h2>卒業までのカリキュラムツリー</h2></div><span className="legend"><i className="legend-hard-line" />実線: 前提科目 <i className="legend-soft-line" />破線: 関連・推奨</span></div>
    <p className="compact">元資料と同じ学期列・到達目標の行・科目の位置をWeb上で再構成しています。科目の箱を直接クリックして、卒業までの目標へ追加・解除できます。</p>
    {isKkReferenceTree ? <div className="interactive-tree-pages">{kkCurriculumTreePages.map((page) => <InteractiveTreePage key={page.id} page={page} courses={courses} targetCourseIds={targetCourseIds} requiredCourseIds={requiredCourseIds} recommendedCourseIds={recommendedCourseIds} completedCourseIds={profile.completedCourseIds} onToggle={onToggle} />)}</div> : <div className="curriculum-reference-unavailable">この専攻の操作可能なツリー配置はまだ登録されていません。ツール1で、レイアウト情報を含むカリキュラムツリー資料を登録してください。</div>}
    <section className="tree-course-picker"><div><p className="eyebrow">SEARCH / ACCESSIBILITY FALLBACK</p><h3>図にない科目を検索して追加する</h3><p>ツリー上に表示されない科目、または科目コードから探したい場合に使えます。ツリーに表示されている科目は、図の箱から直接選択できます。</p></div><label>科目名または科目コードで検索<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例: プログラミング、K1003" /></label><div className="tree-course-picker-results">{matches.length > 0 ? matches.map((course) => { const selected = targetCourseIds.includes(course.id); return <button key={course.id} className={selected ? "tree-course-choice selected" : "tree-course-choice"} onClick={() => onToggle(course.id)}><span className="course-code">{courseCode(course)}</span><strong>{course.name}</strong><small>{course.recommendedGrade}年{course.recommendedTerm === "full_year" ? "通年" : course.recommendedTerm === "spring" ? "前期" : "後期"} / {requirementLabel(course)}{profile.completedCourseIds.includes(course.id) ? " / 修得済み" : ""}</small><em>{selected ? "目標から外す" : "目標に追加"}</em></button>; }) : <p className="compact">{normalizedQuery ? "一致する科目がありません。" : displayedCourseIds.size > 0 ? "科目名または科目コードを入力して検索してください。" : "ツリーの科目を読み込めませんでした。"}</p>}</div></section>
  </section>;
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
  const savedPlanNeedsRefresh = Boolean(savedPlan && savedPlan.datasetVersionId !== dataset.datasetVersionId);
  const progress = useMemo(() => calculateGraduationPlanProgress(dataset, profile, derived), [dataset, profile, derived]);
  const selectedRequirementDefinition = graduationRequirements.find((item) => item.key === selectedRequirement) ?? null;
  const selectedRequirementCourses = useMemo(() => selectedRequirement ? coursesForRequirement(dataset, selectedRequirement) : [], [dataset, selectedRequirement]);

  function toggleTarget(courseId: string) {
    setTargetCourseIds((current) => current.includes(courseId) ? current.filter((id) => id !== courseId) : [...current, courseId]);
  }

  async function save() {
    if (draftPlan.targetCourseIds.length === 0) return;
    await onSave(draftPlan);
  }

  return <section className="graduation-planner">
    <section className="planner-header"><div><p className="eyebrow">TOOL 3 / GRADUATION PLAN</p><h1>卒業までの目標を、科目のつながりから決める。</h1><p>取りたい科目を選ぶと、実線の先修条件と破線の推奨順序を辿り、卒業までに見通したい科目を3つの区分に整理します。保存後、ツール2は今学期に該当する科目を自動選択します。</p></div><div className="planner-actions"><button className="primary-button" disabled={busy || draftPlan.targetCourseIds.length === 0} onClick={() => void save()}>{busy ? "保存中…" : "卒業計画を保存"}</button></div></section>

    <section className="graduation-intro section-card"><div><strong>対象の所属</strong><span>{dataset.program.faculty} / {dataset.program.department} / {dataset.program.name}</span></div><div><strong>保存状態</strong><span>{savedPlan ? `保存済み（${new Date(savedPlan.savedAt).toLocaleString("ja-JP")}）` : "未保存"}</span></div><div><strong>選択方法</strong><span>ツリー上の科目を直接クリックして、目標に追加・解除</span></div></section>

    {savedPlanNeedsRefresh && <section className="notice graduation-plan-notice" role="status"><strong>カリキュラムデータが更新されています</strong><p>保存済みの目標科目から、実線・破線の関係を最新データで再計算済みです。「卒業計画を保存」を押すと、ツール2にも最新の結果が反映されます。</p></section>}

    <CurriculumTreeReference dataset={dataset} profile={profile} targetCourseIds={derived.targetCourseIds} requiredCourseIds={derived.requiredCourseIds} recommendedCourseIds={derived.recommendedCourseIds} onToggle={toggleTarget} />

    <section className="plan-classification-grid">
      <article className="section-card plan-classification target"><p className="eyebrow">1. TARGET COURSES</p><h2>取りたい・やりたい科目</h2><p>{derived.targetCourseIds.length}科目。あなたが選んだ卒業までの目標です。</p><PlanCourseNames dataset={dataset} ids={derived.targetCourseIds} empty="上の検索欄から科目を選んでください。" /></article>
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
