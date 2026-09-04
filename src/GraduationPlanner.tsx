import { useEffect, useMemo, useState } from "react";
import { loadCurriculumTreeImages } from "./firebase";
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

/**
 * 資料の読みやすさをそのまま残すため、KKでは元のカリキュラムツリーを横向きで表示する。
 * 選択操作のボタンを図に重ねると線・文字を覆ってしまうため、同じカード内の検索欄に分離する。
 */
function CurriculumTreeReference({
  dataset,
  profile,
  targetCourseIds,
  onToggle,
}: {
  dataset: Dataset;
  profile: StudentProfile;
  targetCourseIds: string[];
  onToggle: (courseId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("ja-JP");
  const [treeImages, setTreeImages] = useState<{ page1: string; page2: string } | null>(null);
  const [treeImageError, setTreeImageError] = useState(false);
  const matches = useMemo(() => dataset.courses
    .filter((course) => {
      if (!normalizedQuery) return targetCourseIds.includes(course.id);
      return `${course.code} ${course.name}`.toLocaleLowerCase("ja-JP").includes(normalizedQuery);
    })
    .sort((a, b) => a.recommendedGrade - b.recommendedGrade || a.code.localeCompare(b.code, "ja"))
    .slice(0, 30), [dataset, normalizedQuery, targetCourseIds]);
  const isKkReferenceTree = dataset.program.code === "KK";

  useEffect(() => {
    let disposed = false;
    setTreeImages(null);
    setTreeImageError(false);
    if (!isKkReferenceTree) return () => { disposed = true; };
    loadCurriculumTreeImages()
      .then((images) => {
        if (!disposed) setTreeImages(images);
      })
      .catch(() => {
        if (!disposed) setTreeImageError(true);
      });
    return () => { disposed = true; };
  }, [dataset.datasetVersionId, isKkReferenceTree]);

  return <section className="section-card curriculum-reference-card">
    <div className="section-heading"><div><p className="eyebrow">ORIGINAL CURRICULUM TREE</p><h2>卒業までのカリキュラムツリー</h2></div><span className="legend"><i className="legend-hard-line" />実線: 前提科目 <i className="legend-soft-line" />破線: 関連・推奨</span></div>
    <p className="compact">学期ごとの上詰め表示は使わず、元資料と同じ「学習到達目標・専門分野」の行と、科目の位置・線を保って表示します。</p>
    {treeImages ? <div className="curriculum-reference-pages"><figure><img src={treeImages.page1} alt="コンピュータシステム専攻 カリキュラムツリー（学習到達目標・基礎学力）" /></figure><figure><img src={treeImages.page2} alt="コンピュータシステム専攻 カリキュラムツリー（専門基礎・専門技術）" /></figure></div> : <div className="curriculum-reference-unavailable">{treeImageError ? "元資料ツリーを読み込めませんでした。時間をおいて再読み込みしてください。" : isKkReferenceTree ? "認証済みの元資料ツリーを読み込んでいます…" : "この専攻の元資料ツリーはまだ登録されていません。ツール1で、レイアウト情報を含むカリキュラムツリー資料を登録してください。"}</div>}
    <section className="tree-course-picker"><div><p className="eyebrow">SELECT TARGET COURSES</p><h3>科目を目標に追加する</h3><p>元図で科目の位置とつながりを確認し、ここから目標科目を選びます。選択状態は下の3区分へすぐ反映されます。</p></div><label>科目名または科目コードで検索<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例: プログラミング、K1003" /></label><div className="tree-course-picker-results">{matches.length > 0 ? matches.map((course) => { const selected = targetCourseIds.includes(course.id); return <button key={course.id} className={selected ? "tree-course-choice selected" : "tree-course-choice"} onClick={() => onToggle(course.id)}><span className="course-code">{courseCode(course)}</span><strong>{course.name}</strong><small>{course.recommendedGrade}年{course.recommendedTerm === "full_year" ? "通年" : course.recommendedTerm === "spring" ? "前期" : "後期"} / {requirementLabel(course)}{profile.completedCourseIds.includes(course.id) ? " / 修得済み" : ""}</small><em>{selected ? "目標から外す" : "目標に追加"}</em></button>; }) : <p className="compact">科目名または科目コードを入力して検索してください。</p>}</div></section>
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

    <section className="graduation-intro section-card"><div><strong>対象の所属</strong><span>{dataset.program.faculty} / {dataset.program.department} / {dataset.program.name}</span></div><div><strong>保存状態</strong><span>{savedPlan ? `保存済み（${new Date(savedPlan.savedAt).toLocaleString("ja-JP")}）` : "未保存"}</span></div><div><strong>選択方法</strong><span>元図で位置とつながりを確認し、検索欄から目標に追加・解除</span></div></section>

    <CurriculumTreeReference dataset={dataset} profile={profile} targetCourseIds={derived.targetCourseIds} onToggle={toggleTarget} />

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
