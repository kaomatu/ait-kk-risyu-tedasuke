import { Fragment, useEffect, useMemo, useState } from "react";
import { createIngestionJob, createInitialKkDataset, firebaseEnabled, listProfileSnapshots, loadCatalog, loadGraduationPlan, loadProfileSnapshot, loginWithPassphrase, logout, saveGraduationPlan, saveProfileSnapshot, subscribeToAuth } from "./firebase";
import { activeAnnualCap, autoGraduationPlanWanted, autoRequiredCourseIds, calculateProgress, canUseOffering, generatePlan, recommendCourses, requiredScheduleSlots } from "./planEngine";
import { GraduationPlanner } from "./GraduationPlanner";
import { slotKey, termLabels, weekdayLabels, type Course, type Dataset, type GraduationPlan, type PlanResult, type ProfileSnapshotSummary, type StudentProfile, type Weekday } from "./types";
import "./styles.css";

type Tab = "overview" | "ingestion" | "graduation_planner" | "planner" | "rules";
const weekdays: Weekday[] = ["mon", "tue", "wed", "thu", "fri"];
const periods = [1, 2, 3, 4, 5, 6];

function defaultProfile(): StudentProfile {
  return {
    currentGrade: 1,
    term: "spring",
    gpa: null,
    annualCapBonusLocked: false,
    completedCourseIds: [],
    wanted: {},
    futureGoalCourseIds: [],
    targetTermCredits: null,
    autoRequiredCourseIds: [],
    autoGraduationPlanWanted: {},
    rechallengeCourseIds: [],
    lotteryStates: {},
    hardBlockedSlots: [],
    softBlockedSlots: [],
    annualRegisteredCredits: 0,
  };
}

function profileFromUnknown(value: unknown): StudentProfile | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StudentProfile>;
  if (!Number.isInteger(candidate.currentGrade) || (candidate.term !== "spring" && candidate.term !== "fall")) return null;
  if (!Array.isArray(candidate.completedCourseIds) || !candidate.wanted || (candidate.futureGoalCourseIds !== undefined && !Array.isArray(candidate.futureGoalCourseIds)) || (candidate.targetTermCredits !== undefined && candidate.targetTermCredits !== null && typeof candidate.targetTermCredits !== "number") || (candidate.autoRequiredCourseIds !== undefined && !Array.isArray(candidate.autoRequiredCourseIds)) || !Array.isArray(candidate.rechallengeCourseIds) || !candidate.lotteryStates || !Array.isArray(candidate.hardBlockedSlots) || !Array.isArray(candidate.softBlockedSlots)) return null;
  return { ...defaultProfile(), ...candidate };
}

function labelRequirement(course: Course) {
  return course.requirementType === "required" ? "必修" : course.requirementType === "required_elective" ? "選択必修" : course.requirementType === "non_counting" ? "要件外" : "選択";
}

function displayCourseCode(course: Course) {
  return course.officialCode === false ? "資料コード未確認" : course.code;
}

function statusClass(course: Course, profile: StudentProfile) {
  if (profile.completedCourseIds.includes(course.id)) return "completed";
  if ((course.hardPrerequisites ?? []).some((id) => !profile.completedCourseIds.includes(id))) return "blocked";
  if (profile.wanted[course.id]) return "wanted";
  return "available";
}

export default function App() {
  const localPreview = import.meta.env.DEV && import.meta.env.VITE_LOCAL_PREVIEW_AUTH === "true";
  const [userReady, setUserReady] = useState(false);
  const [hasAccess, setHasAccess] = useState(localPreview && sessionStorage.getItem("ait-kk-local-preview-auth") === "1");
  const [tab, setTab] = useState<Tab>("overview");
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loadingDataset, setLoadingDataset] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<StudentProfile>(defaultProfile);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [graduationPlan, setGraduationPlan] = useState<GraduationPlan | null>(null);
  const [graduationPlanBusy, setGraduationPlanBusy] = useState(false);
  const [snapshots, setSnapshots] = useState<ProfileSnapshotSummary[]>([]);
  const [snapshotBusy, setSnapshotBusy] = useState(false);

  useEffect(() => subscribeToAuth((user) => {
    setHasAccess(Boolean(user) || (localPreview && sessionStorage.getItem("ait-kk-local-preview-auth") === "1"));
    setUserReady(true);
  }), [localPreview]);

  useEffect(() => {
    if (!hasAccess) {
      setDataset(null);
      setSnapshots([]);
      setProfile(defaultProfile());
      setGraduationPlan(null);
      return;
    }
    setLoadingDataset(true);
    loadCatalog()
      .then((next) => setDataset(next))
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "カタログの取得に失敗しました。"))
      .finally(() => setLoadingDataset(false));
    listProfileSnapshots()
      .then(setSnapshots)
      .catch(() => setMessage("保存済みの履修計画一覧を読み込めませんでした。新しい計画として続けられます。"));
    loadGraduationPlan()
      .then(setGraduationPlan)
      .catch(() => setMessage("卒業計画を読み込めませんでした。新しい計画として続けられます。"));
  }, [hasAccess]);

  const planProgress = useMemo(() => dataset ? calculateProgress(dataset, profile, plan) : null, [dataset, profile, plan]);

  useEffect(() => {
    if (!dataset) return;
    const requiredIds = autoRequiredCourseIds(dataset, profile);
    setProfile((current) => {
      const desired = new Set(requiredIds);
      const wanted = { ...current.wanted };
      const previousAutoIds = current.autoRequiredCourseIds;
      const longTermWanted = autoGraduationPlanWanted(dataset, current, graduationPlan);
      const previousLongTermWanted = current.autoGraduationPlanWanted ?? {};
      for (const id of previousAutoIds) {
        if (!desired.has(id) && wanted[id] === "must") delete wanted[id];
      }
      for (const [id, priority] of Object.entries(previousLongTermWanted)) {
        if (!longTermWanted[id] && !desired.has(id) && wanted[id] === priority) delete wanted[id];
      }
      const newAutoIds = requiredIds.filter((id) => !previousAutoIds.includes(id));
      for (const id of newAutoIds) wanted[id] = "must";
      for (const [id, priority] of Object.entries(longTermWanted)) {
        if (!wanted[id] || priority === "must") wanted[id] = priority;
      }
      const nextAutoIds = [
        ...previousAutoIds.filter((id) => desired.has(id) && wanted[id] === "must"),
        ...newAutoIds,
      ];
      const requiredSlots = requiredScheduleSlots(dataset, { ...current, wanted, autoRequiredCourseIds: nextAutoIds });
      const hardBlockedSlots = current.hardBlockedSlots.filter((slot) => !requiredSlots.includes(slot));
      const softBlockedSlots = current.softBlockedSlots.filter((slot) => !requiredSlots.includes(slot));
      const unchanged = nextAutoIds.length === previousAutoIds.length
        && nextAutoIds.every((id, index) => id === previousAutoIds[index])
        && Object.keys(longTermWanted).length === Object.keys(previousLongTermWanted).length
        && Object.entries(longTermWanted).every(([id, priority]) => previousLongTermWanted[id] === priority)
        && Object.keys(wanted).length === Object.keys(current.wanted).length
        && Object.entries(wanted).every(([id, priority]) => current.wanted[id] === priority)
        && hardBlockedSlots.length === current.hardBlockedSlots.length
        && softBlockedSlots.length === current.softBlockedSlots.length;
      return unchanged ? current : { ...current, wanted, autoRequiredCourseIds: nextAutoIds, autoGraduationPlanWanted: longTermWanted, hardBlockedSlots, softBlockedSlots };
    });
    setPlan(null);
  }, [dataset, graduationPlan, profile.currentGrade, profile.term, profile.completedCourseIds]);

  function patchProfile(patch: Partial<StudentProfile>) {
    setProfile((current) => ({ ...current, ...patch }));
    setPlan(null);
  }

  async function seedDataset() {
    try {
      setLoadingDataset(true);
      const next = await createInitialKkDataset();
      setDataset(next);
      setMessage("初期データセットを作成しました。ツール1でレビュー済みデータへ置き換えられます。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "初期データセットの作成に失敗しました。");
    } finally {
      setLoadingDataset(false);
    }
  }

  async function saveNumberedProfile() {
    setSnapshotBusy(true);
    try {
      const snapshot = await saveProfileSnapshot(profile);
      setSnapshots((current) => [snapshot, ...current].sort((a, b) => b.snapshotNo - a.snapshotNo));
      setMessage(`現在の履修計画を No. ${snapshot.snapshotNo} として保存しました。`);
      return snapshot;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "履修計画を保存できませんでした。");
      throw error;
    } finally {
      setSnapshotBusy(false);
    }
  }

  async function loadNumberedProfile(snapshotNo: number) {
    setSnapshotBusy(true);
    try {
      const snapshot = await loadProfileSnapshot(snapshotNo);
      const savedProfile = profileFromUnknown(snapshot.profile);
      if (!savedProfile) throw new Error(`No. ${snapshotNo} の保存データを読み込めませんでした。`);
      setProfile(savedProfile);
      setPlan(null);
      setMessage(`No. ${snapshotNo} の履修計画を読み込みました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "履修計画を読み込めませんでした。");
      throw error;
    } finally {
      setSnapshotBusy(false);
    }
  }

  async function saveCurrentGraduationPlan(nextPlan: GraduationPlan) {
    setGraduationPlanBusy(true);
    try {
      const saved = await saveGraduationPlan(nextPlan);
      setGraduationPlan(saved);
      setMessage("卒業までの科目計画を保存しました。ツール2では今学期に該当する科目を自動選択します。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "卒業計画を保存できませんでした。");
      throw error;
    } finally {
      setGraduationPlanBusy(false);
    }
  }

  if (!userReady) return <main className="loading-screen">接続を確認しています…</main>;
  if (!hasAccess) return <AccessGate localPreview={localPreview} onLocalAccess={() => setHasAccess(true)} />;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">履</span>
          <div><strong>履修てだすけ</strong><small>{dataset ? `${dataset.program.entryDate}入学 / ${dataset.program.code}` : "認証済みワークスペース"}</small></div>
        </div>
        <div className="secure-badge"><span>●</span> パスワード認証済み</div>
        <button className="text-button" onClick={() => { void logout(); setHasAccess(false); }}>退出</button>
      </header>

      <nav className="tabs" aria-label="主な画面">
        <TabButton current={tab} target="overview" onClick={setTab}>概要</TabButton>
        <TabButton current={tab} target="ingestion" onClick={setTab}>ツール1: DB生成</TabButton>
        <TabButton current={tab} target="graduation_planner" onClick={setTab}>ツール3: 卒業計画</TabButton>
        <TabButton current={tab} target="planner" onClick={setTab}>ツール2: 履修計画</TabButton>
        <TabButton current={tab} target="rules" onClick={setTab}>要件・ルール</TabButton>
      </nav>

      {message && <div className="toast" role="status"><span>{message}</span><button onClick={() => setMessage(null)} aria-label="閉じる">×</button></div>}

      <section className="content">
        {loadingDataset && <div className="inline-loading">データを読み込んでいます…</div>}
        {!loadingDataset && !dataset && !localPreview && <DatasetSetup onSeed={seedDataset} />}
        {dataset && tab === "overview" && <Overview dataset={dataset} profile={profile} progress={planProgress} onOpenPlanner={() => setTab("planner")} />}
        {dataset && tab === "ingestion" && <IngestionTool localPreview={localPreview} onMessage={setMessage} />}
        {dataset && tab === "graduation_planner" && <GraduationPlanner dataset={dataset} profile={profile} savedPlan={graduationPlan} busy={graduationPlanBusy} onSave={saveCurrentGraduationPlan} />}
        {dataset && tab === "planner" && <Planner dataset={dataset} profile={profile} plan={plan} progress={planProgress} graduationPlan={graduationPlan} patchProfile={patchProfile} onGenerate={() => setPlan(generatePlan(dataset, profile))} snapshots={snapshots} snapshotBusy={snapshotBusy} onSaveSnapshot={saveNumberedProfile} onLoadSnapshot={loadNumberedProfile} />}
        {dataset && tab === "rules" && <Rules dataset={dataset} />}
      </section>
    </main>
  );
}

function TabButton({ current, target, onClick, children }: { current: Tab; target: Tab; onClick: (tab: Tab) => void; children: React.ReactNode }) {
  return <button className={current === target ? "tab active" : "tab"} onClick={() => onClick(target)}>{children}</button>;
}

function AccessGate({ localPreview, onLocalAccess }: { localPreview: boolean; onLocalAccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (localPreview) {
        if (!password) throw new Error("ローカル確認用にパスワード欄へ任意の文字を入力してください。");
        sessionStorage.setItem("ait-kk-local-preview-auth", "1");
        onLocalAccess();
        return;
      }
      await loginWithPassphrase(password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "認証に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="access-page">
      <section className="access-card">
        <div className="access-icon" aria-hidden="true">⌁</div>
        <p className="eyebrow">PRIVATE CURRICULUM WORKSPACE</p>
        <h1>履修てだすけ</h1>
        <p>教育課程・時間割・履修計画を、専攻内だけで安全に扱うための入口です。</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="password">アクセスパスワード</label>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="パスワードを入力" required />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button full" disabled={busy}>{busy ? "確認中…" : "安全に入室する"}</button>
        </form>
        <p className="security-note">パスワードはブラウザに保存せず、Firebase上のサーバーで照合します。</p>
        {!firebaseEnabled && !localPreview && <p className="form-error">Firebase接続設定がまだ完了していません。</p>}
      </section>
    </main>
  );
}

function DatasetSetup({ onSeed }: { onSeed: () => Promise<void> }) {
  return <section className="empty-state">
    <p className="eyebrow">FIRST-RUN SETUP</p>
    <h1>初期データセットを作成します</h1>
    <p>初回だけ、レビュー済みの初期データをFirebaseへ登録します。登録後は、ツール1のレビュー済みデータで更新します。</p>
    <button className="primary-button" onClick={() => void onSeed()}>初期データセットを作成</button>
  </section>;
}

function Overview({ dataset, profile, progress, onOpenPlanner }: { dataset: Dataset; profile: StudentProfile; progress: ReturnType<typeof calculateProgress> | null; onOpenPlanner: () => void }) {
  const cap = activeAnnualCap(dataset, profile);
  const nextPromotion = dataset.policies.progression.find((rule) => rule.toGrade === Math.min(4, profile.currentGrade + 1));
  return <>
    <section className="hero-panel">
      <div>
        <p className="eyebrow">PRIVATE CURRICULUM WORKSPACE</p>
        <h1>今学期の履修を、根拠と一緒に組み立てる。</h1>
        <p>対象: {dataset.program.faculty} / {dataset.program.name} / {dataset.program.entryDate}入学</p>
      </div>
      <button className="primary-button" onClick={onOpenPlanner}>履修計画を始める →</button>
    </section>
    <section className="metric-grid">
      <Metric label="公開データセット" value={`${dataset.program.entryDate} / ${dataset.program.code}`} detail={dataset.datasetVersionId} />
      <Metric label="学期の上限" value={`${dataset.policies.termCap}単位`} detail="上限対象科目のみ" />
      <Metric label="今年度の上限" value={`${cap}単位`} detail={profile.annualCapBonusLocked ? "GPA優遇を継続中" : "通常上限"} />
      <Metric label="次の進級目安" value={nextPromotion ? `${nextPromotion.minCredits}単位` : "卒業年次"} detail={nextPromotion?.minGpa !== undefined ? `GPA ${nextPromotion.minGpa}以上` : ""} />
    </section>
    {progress && <section className="section-card">
      <div className="section-heading"><div><p className="eyebrow">CURRENT PROGRESS</p><h2>単位の現在地</h2></div><span className="pill">計画前の概算</span></div>
      <div className="progress-grid">
        <ProgressLine label="専門教育科目" value={progress.specializedTotal} target={dataset.policies.graduation.specializedTotal} />
        <ProgressLine label="総合教育科目" value={progress.generalTotal} target={dataset.policies.graduation.generalTotal} />
        <ProgressLine label="英語系科目" value={progress.english} target={dataset.policies.graduation.english} />
        <ProgressLine label="卒業要件総計" value={progress.graduationTotal} target={dataset.policies.graduation.total} />
      </div>
    </section>}
    <section className="two-column">
      <article className="section-card"><h2>ツール1</h2><p>PDF・画像の資料を、根拠とレビュー履歴つきの専攻別データへ変換します。</p><ul><li>資料種別を指定</li><li>原本ハッシュを保存</li><li>AI抽出は秘密キー設定後に実行</li></ul></article>
      <article className="section-card"><h2>ツール2</h2><p>修得履歴、希望科目、空けたい時限を元に、履修できる候補と注意点を表示します。</p><ul><li>実線前提は登録禁止として判定</li><li>破線は推奨として表示</li><li>抽選・上限・時間衝突を分離</li></ul></article>
    </section>
  </>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function ProgressLine({ label, value, target }: { label: string; value: number; target: number }) {
  const percent = Math.min(100, target === 0 ? 0 : Math.round((value / target) * 100));
  return <div className="progress-line"><div className="progress-title"><span>{label}</span><strong>{value} / {target} 単位</strong></div><div className="bar"><span style={{ width: `${percent}%` }} /></div></div>;
}

function IngestionTool({ localPreview, onMessage }: { localPreview: boolean; onMessage: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [documentKind, setDocumentKind] = useState("curriculum_table");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<{ jobId: string; status: string; note: string } | null>(null);

  async function sha256(fileToHash: File) {
    const data = await fileToHash.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
  }

  async function createJob() {
    if (!file) return;
    setBusy(true);
    try {
      const digest = await sha256(file);
      if (localPreview) {
        setJob({ jobId: "local-preview-job", status: "waiting_for_ai_api_configuration", note: "ローカル確認では外部送信を行いません。" });
      } else {
        setJob(await createIngestionJob({ fileName: file.name, mimeType: file.type || "application/octet-stream", byteLength: file.size, sha256: digest, documentKind }));
      }
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "ジョブの作成に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <section className="section-heading standalone"><div><p className="eyebrow">TOOL 1 / INGESTION</p><h1>専攻別の授業DBを生成する</h1><p>AIは構造化候補を作るだけです。公開データは、根拠・検証・人手レビューを通過してから更新されます。</p></div></section>
    <section className="ingestion-grid">
      <article className="section-card">
        <h2>1. 資料を選択</h2>
        <label>資料種別<select value={documentKind} onChange={(event) => setDocumentKind(event.target.value)}><option value="curriculum_table">教育課程表</option><option value="requirements">進級・卒業要件</option><option value="curriculum_tree">カリキュラムツリー</option><option value="timetable_regular">通常時間割</option><option value="timetable_lottery">抽選時間割</option></select></label>
        <label className="drop-zone"><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><span>PDF / PNG / JPEG</span><strong>{file ? file.name : "資料を選択"}</strong><small>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "元ファイルは、AI API設定前には外部送信しません。"}</small></label>
        <button className="primary-button" disabled={!file || busy} onClick={() => void createJob()}>{busy ? "ハッシュを計算中…" : "構造化ジョブを作成"}</button>
      </article>
      <article className="section-card emphasis-card">
        <h2>2. AI抽出とレビュー</h2>
        <ol><li>原本のハッシュ・資料種別・対象専攻を記録</li><li>AIが科目・時間割・要件・線の候補をJSONで抽出</li><li>科目コード、単位、実線前提、要件合計を検証</li><li>不明箇所を確認してデータセットを公開</li></ol>
        <p className="callout">現在は、AI APIキーが未設定のため、ジョブ作成後に資料本文を外部へ送信しません。キー設定後はCloud Functions内でのみAI APIへ送ります。</p>
      </article>
    </section>
    {job && <section className="section-card job-result"><span className="pill warning">{job.status}</span><h2>ジョブを作成しました</h2><p>ジョブID: <code>{job.jobId}</code></p><p>{job.note}</p></section>}
    <section className="section-card"><div className="section-heading"><div><p className="eyebrow">OUTPUT CONTRACT</p><h2>公開前に必ず保存する情報</h2></div></div><div className="contract-grid"><code>Course<br />正式名称・科目コード・単位・必選区分</code><code>Offering<br />年度・学期・クラス・曜日時限・抽選</code><code>Requirement<br />進級・卒業・上限・科目群</code><code>Evidence<br />ページ・座標・原文・信頼度</code></div></section>
  </>;
}

function Planner({ dataset, profile, plan, progress, graduationPlan, patchProfile, onGenerate, snapshots, snapshotBusy, onSaveSnapshot, onLoadSnapshot }: { dataset: Dataset; profile: StudentProfile; plan: PlanResult | null; progress: ReturnType<typeof calculateProgress> | null; graduationPlan: GraduationPlan | null; patchProfile: (patch: Partial<StudentProfile>) => void; onGenerate: () => void; snapshots: ProfileSnapshotSummary[]; snapshotBusy: boolean; onSaveSnapshot: () => Promise<ProfileSnapshotSummary>; onLoadSnapshot: (snapshotNo: number) => Promise<void> }) {
  const catalogByGrade = [1, 2, 3, 4].map((grade) => ({ grade, courses: dataset.courses.filter((course) => course.recommendedGrade === grade) }));
  const termCourses = dataset.courses.filter((course) => course.offerings.some((offering) => (
    canUseOffering(course, offering, profile)
  )));
  const lotteryCourses = termCourses.filter((course) => course.offerings.some((offering) => (
    offering.lottery
    && canUseOffering(course, offering, profile)
  )));
  const annualCap = activeAnnualCap(dataset, profile);
  const automaticRequiredCourses = profile.autoRequiredCourseIds
    .map((id) => dataset.courses.find((course) => course.id === id))
    .filter((course): course is Course => Boolean(course));
  const automaticGraduationPlanCourses = Object.entries(profile.autoGraduationPlanWanted ?? {})
    .map(([id, priority]) => ({ course: dataset.courses.find((course) => course.id === id), priority }))
    .filter((item): item is { course: Course; priority: "must" | "prefer" } => Boolean(item.course));
  const protectedRequiredSlots = useMemo(() => requiredScheduleSlots(dataset, profile), [dataset, profile]);
  const recommendations = useMemo(() => plan ? recommendCourses(dataset, profile, plan) : [], [dataset, profile, plan]);

  function isOfferedThisTerm(course: Course) {
    return course.offerings.some((offering) => canUseOffering(course, offering, profile));
  }

  function toggleWanted(course: Course) {
    // 自動選択された必修は、計画の土台として固定する。
    if (profile.autoRequiredCourseIds.includes(course.id)) return;
    const current = profile.wanted[course.id];
    const wanted = { ...profile.wanted };
    if (!current) wanted[course.id] = "prefer";
    else if (current === "prefer") wanted[course.id] = "must";
    else delete wanted[course.id];
    // 学期変更で将来目標だった科目が今期に開講した場合は、二重の意図を残さない。
    patchProfile({ wanted, futureGoalCourseIds: profile.futureGoalCourseIds.filter((id) => id !== course.id) });
  }

  function toggleFutureGoal(course: Course) {
    const futureGoalCourseIds = profile.futureGoalCourseIds.includes(course.id)
      ? profile.futureGoalCourseIds.filter((id) => id !== course.id)
      : [...profile.futureGoalCourseIds, course.id];
    patchProfile({ futureGoalCourseIds });
  }

  function toggleCourseIntent(course: Course) {
    if (isOfferedThisTerm(course)) toggleWanted(course);
    else toggleFutureGoal(course);
  }

  function toggleCompleted(courseId: string) {
    const completed = profile.completedCourseIds.includes(courseId)
      ? profile.completedCourseIds.filter((id) => id !== courseId)
      : [...profile.completedCourseIds, courseId];
    patchProfile({ completedCourseIds: completed });
  }

  function toggleRechallenge(courseId: string) {
    const rechallengeCourseIds = profile.rechallengeCourseIds.includes(courseId)
      ? profile.rechallengeCourseIds.filter((id) => id !== courseId)
      : [...profile.rechallengeCourseIds, courseId];
    patchProfile({ rechallengeCourseIds });
  }

  function cycleSlot(weekday: Weekday, period: number) {
    const key = slotKey(weekday, period);
    if (protectedRequiredSlots.includes(key)) return;
    if (profile.hardBlockedSlots.includes(key)) {
      patchProfile({ hardBlockedSlots: profile.hardBlockedSlots.filter((slot) => slot !== key), softBlockedSlots: [...profile.softBlockedSlots, key] });
    } else if (profile.softBlockedSlots.includes(key)) {
      patchProfile({ softBlockedSlots: profile.softBlockedSlots.filter((slot) => slot !== key) });
    } else {
      patchProfile({ hardBlockedSlots: [...profile.hardBlockedSlots, key] });
    }
  }

  return <>
    <section className="planner-header"><div><p className="eyebrow">TOOL 2 / TERM PLANNER</p><h1>今学期の履修を、卒業計画から組み立てる。</h1><p>ツール3の保存済み計画から今期に履修可能な科目と、未修得の必修を自動選択します。残りは希望・先修条件・空き希望をもとに自由に調整できます。</p></div><div className="planner-actions"><button className="primary-button" onClick={onGenerate}>履修案を生成する</button></div></section>
    <section className="profile-strip section-card">
      <label>対象の所属<select disabled value={dataset.program.code}><option value={dataset.program.code}>{dataset.program.faculty} / {dataset.program.name}</option></select><small>現在はこの専攻用データベースのみを登録しています。</small></label>
      <label>現在の学年<select value={profile.currentGrade} onChange={(event) => patchProfile({ currentGrade: Number(event.target.value) })}>{[1, 2, 3, 4].map((grade) => <option value={grade} key={grade}>{grade}年次</option>)}</select></label>
      <label>現在の学期<select value={profile.term} onChange={(event) => patchProfile({ term: event.target.value as StudentProfile["term"] })}><option value="spring">前期</option><option value="fall">後期</option></select></label>
      <label>通算GPA<input type="number" step="0.01" min="0" max="4" placeholder="不明なら空欄" value={profile.gpa ?? ""} onChange={(event) => patchProfile({ gpa: event.target.value === "" ? null : Number(event.target.value) })} /><small>進級判定の目安用。現在の入力だけで上限は変わりません。</small></label>
      <label>今年度の登録済み単位<input type="number" min="0" max={annualCap} value={profile.annualRegisteredCredits} onChange={(event) => patchProfile({ annualRegisteredCredits: Number(event.target.value) })} /></label>
      <label>今期に取りたい単位数<input type="number" min="0" max={dataset.policies.termCap} placeholder="任意" value={profile.targetTermCredits ?? ""} onChange={(event) => patchProfile({ targetTermCredits: event.target.value === "" ? null : Number(event.target.value) })} /><small>不足時は候補のみ表示し、自動追加はしません。</small></label>
      <label className="check-label"><input type="checkbox" checked={profile.annualCapBonusLocked} onChange={(event) => patchProfile({ annualCapBonusLocked: event.target.checked })} /> 進級時の判定で年間52単位の優遇を取得済み</label>
    </section>
    {graduationPlan && <section className="notice graduation-plan-notice" role="status"><strong>ツール3の卒業計画を連携中です</strong><p>目標 {graduationPlan.targetCourseIds.length}科目、必要な先修 {graduationPlan.requiredCourseIds.length}科目、推奨 {graduationPlan.recommendedCourseIds.length}科目を保存済みです。今期に履修可能な {automaticGraduationPlanCourses.length} 科目を自動選択しました。</p>{automaticGraduationPlanCourses.length > 0 && <ul>{automaticGraduationPlanCourses.map(({ course, priority }) => <li key={course.id}>{course.name}（{priority === "must" ? "卒業計画・優先" : "卒業計画・推奨"}）</li>)}</ul>}</section>}
    {automaticRequiredCourses.length > 0 && <section className="notice auto-required-notice" role="status"><strong>必修を自動選択・固定しました</strong><p>{automaticRequiredCourses.map((course) => course.name).join("、")}</p></section>}
    <section className="planner-layout">
      <div className="planner-main">
        <article className="section-card"><div className="section-heading"><div><p className="eyebrow">CURRICULUM TREE</p><h2>取りたい科目を選ぶ</h2></div><span className="legend"><i className="legend-required" />必修 <i className="legend-completed" />修得済 <i className="legend-wanted" />今期の希望 <i className="legend-blocked" />前提未達</span></div><p className="compact">今期に開講するカードは「できれば」→「必ず」→解除。今期に開講しないカードは、クリックで「将来の目標」を切り替えます。</p>
          <div className="tree-grid">{catalogByGrade.map(({ grade, courses }) => <section className="tree-column" key={grade}><h3>{grade}年次</h3>{courses.map((course) => { const offeredThisTerm = isOfferedThisTerm(course); return <button key={course.id} className={`course-card ${statusClass(course, profile)} ${course.requirementType} ${profile.wanted[course.id] ?? ""} ${profile.futureGoalCourseIds.includes(course.id) ? "future-goal" : ""}`} onClick={() => toggleCourseIntent(course)} disabled={profile.autoRequiredCourseIds.includes(course.id)}><span className="course-code">{displayCourseCode(course)}</span><div className="course-title"><strong>{course.name}</strong><span className={`requirement-badge ${course.requirementType}`}>{labelRequirement(course)}</span></div><small>{course.credits}単位 / {course.recommendedTerm === "full_year" ? "通年" : termLabels[course.recommendedTerm]}{offeredThisTerm ? " / 今期開講" : " / 今期は未開講"}</small>{profile.wanted[course.id] && <em>{profile.autoRequiredCourseIds.includes(course.id) ? "必修・自動選択" : profile.wanted[course.id] === "must" ? "必ず取りたい" : "できれば取りたい"}</em>}{!profile.wanted[course.id] && profile.futureGoalCourseIds.includes(course.id) && <em className="future-goal-label">将来の目標</em>}</button>; })}</section>)}</div>
        </article>
        <article className="section-card"><div className="section-heading"><div><p className="eyebrow">COMPLETED HISTORY</p><h2>修得済みの科目</h2></div><span className="pill">選択式入力</span></div><p>カタログから科目を選択して修得履歴を入力します。自由入力は使いません。</p><div className="history-list">{dataset.courses.map((course) => <label key={course.id} className="history-item"><input type="checkbox" checked={profile.completedCourseIds.includes(course.id)} onChange={() => toggleCompleted(course.id)} /> <span>{displayCourseCode(course)}</span><strong>{course.name}</strong><small>{course.credits}単位</small></label>)}</div>{profile.completedCourseIds.length > 0 && <div className="rechallenge-list"><p><b>再チャレンジ履修</b>（修得済みでも今期にもう一度履修する科目）</p>{profile.completedCourseIds.map((id) => { const course = dataset.courses.find((item) => item.id === id); return course ? <label key={id} className="mini-check"><input type="checkbox" checked={profile.rechallengeCourseIds.includes(id)} onChange={() => toggleRechallenge(id)} /> {course.name}</label> : null; })}</div>}</article>
      </div>
      <aside className="planner-side">
        <article className="section-card"><p className="eyebrow">FREE TIME</p><h2>空けたい時限</h2><p className="compact">クリック: 固定で空ける → できれば空ける → 解除。必修の固定枠は「必」と表示され、空き希望にはできません。</p><div className="slot-grid"><span />{weekdays.map((day) => <span className="slot-header" key={day}>{weekdayLabels[day]}</span>)}{periods.map((period) => <Fragment key={`period-${period}`}><span className="period-label">{period}</span>{weekdays.map((day) => { const key = slotKey(day, period); const protectedSlot = protectedRequiredSlots.includes(key); const mode = profile.hardBlockedSlots.includes(key) ? "hard" : profile.softBlockedSlots.includes(key) ? "soft" : ""; return <button key={key} disabled={protectedSlot} className={`slot ${mode} ${protectedSlot ? "required-slot" : ""}`} onClick={() => cycleSlot(day, period)} aria-label={`${weekdayLabels[day]}曜日${period}限`}>{protectedSlot ? "必" : mode === "hard" ? "空" : mode === "soft" ? "△" : ""}</button>; })}</Fragment>)}</div><div className="slot-caption"><span>必 = 必修の固定枠</span><span>空 = 固定</span><span>△ = できれば</span></div></article>
        {progress && <article className="section-card"><p className="eyebrow">REQUIREMENTS</p><h2>要件の進捗</h2><ProgressLine label="進級用合計" value={progress.projectedProgression} target={dataset.policies.progression.find((rule) => rule.toGrade === Math.min(4, profile.currentGrade + 1))?.minCredits ?? 105} /><ProgressLine label="専門合計" value={progress.specializedTotal} target={dataset.policies.graduation.specializedTotal} /><ProgressLine label="総合合計" value={progress.generalTotal} target={dataset.policies.graduation.generalTotal} /><ProgressLine label="英語系" value={progress.english} target={dataset.policies.graduation.english} /><ProgressLine label="卒業総計" value={progress.graduationTotal} target={dataset.policies.graduation.total} /></article>}
        {lotteryCourses.length > 0 && <article className="section-card"><p className="eyebrow">LOTTERY STATUS</p><h2>抽選の状況</h2><p className="compact">結果を手動で反映します。落選後は同じ科目を再申請でき、当選後は別クラスへ申請できません。</p><div className="lottery-list">{lotteryCourses.map((course) => <label key={course.id}>{course.name}<select value={profile.lotteryStates[course.id] ?? "none"} onChange={(event) => patchProfile({ lotteryStates: { ...profile.lotteryStates, [course.id]: event.target.value as "none" | "applied" | "lost" | "won" } })}><option value="none">未申請</option><option value="applied">申請中</option><option value="lost">落選（再申請可能）</option><option value="won">当選済み</option></select></label>)}</div></article>}
        <SnapshotControls snapshots={snapshots} busy={snapshotBusy} onSave={onSaveSnapshot} onLoad={onLoadSnapshot} />
      </aside>
    </section>
    {plan && <PlanResultView dataset={dataset} profile={profile} plan={plan} recommendations={recommendations} onAddRecommendation={(course) => patchProfile({ wanted: { ...profile.wanted, [course.id]: "prefer" }, futureGoalCourseIds: profile.futureGoalCourseIds.filter((id) => id !== course.id) })} />}
  </>;
}

function SnapshotControls({ snapshots, busy, onSave, onLoad }: { snapshots: ProfileSnapshotSummary[]; busy: boolean; onSave: () => Promise<ProfileSnapshotSummary>; onLoad: (snapshotNo: number) => Promise<void> }) {
  const [selectedSnapshotNo, setSelectedSnapshotNo] = useState("");

  async function save() {
    try {
      const snapshot = await onSave();
      setSelectedSnapshotNo(String(snapshot.snapshotNo));
    } catch { /* 親コンポーネントがエラーをトースト表示する */ }
  }

  async function load() {
    const snapshotNo = Number(selectedSnapshotNo);
    if (!Number.isInteger(snapshotNo) || snapshotNo < 1) return;
    try {
      await onLoad(snapshotNo);
    } catch { /* 親コンポーネントがエラーをトースト表示する */ }
  }

  return <article className="section-card snapshot-controls"><p className="eyebrow">SAVED PLANS</p><h2>保存・読み込み</h2><p className="compact">保存するたびに No. を自動で増やします。保存データの削除は行いません。</p><button className="secondary-button full" disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : "保存する"}</button><label>読み込むデータ<select value={selectedSnapshotNo} disabled={busy || snapshots.length === 0} onChange={(event) => setSelectedSnapshotNo(event.target.value)}><option value="">No. を選択</option>{snapshots.map((snapshot) => <option value={snapshot.snapshotNo} key={snapshot.snapshotNo}>No. {snapshot.snapshotNo}（{new Date(snapshot.savedAt).toLocaleString("ja-JP")}）</option>)}</select></label><button className="primary-button full" disabled={busy || !selectedSnapshotNo} onClick={() => void load()}>{busy ? "読み込み中…" : "読み込む"}</button>{snapshots.length === 0 && <small>まだ保存データはありません。最初の保存は No. 1 です。</small>}</article>;
}

function PlanResultView({ dataset, profile, plan, recommendations, onAddRecommendation }: { dataset: Dataset; profile: StudentProfile; plan: PlanResult; recommendations: ReturnType<typeof recommendCourses>; onAddRecommendation: (course: Course) => void }) {
  const annualCap = activeAnnualCap(dataset, profile);
  const plannedCredits = plan.selected.reduce((sum, item) => sum + item.course.credits, 0);
  return <section className="plan-result"><div className="section-heading"><div><p className="eyebrow">PLAN RESULT</p><h2>今学期の履修案</h2></div><span className={plan.rejected.length ? "pill warning" : "pill success"}>{plan.rejected.length ? "注意あり" : "登録可能"}</span></div>
    <div className="metric-grid compact-metrics"><Metric label="取得見込み" value={`${plannedCredits}単位`} detail="全科目に合格した場合" /><Metric label="抽選結果待ち" value={`${plan.lotteryCredits}単位`} detail="当選は保証されません" /><Metric label="学期上限" value={`${plan.capCountedCredits} / ${dataset.policies.termCap}`} detail="上限算入単位" /><Metric label="年間上限" value={`${profile.annualRegisteredCredits + plan.capCountedCredits} / ${annualCap}`} detail="登録済み分を含む" /></div>
    <div className="plan-cards">{plan.selected.length ? plan.selected.map(({ course, offering, priority }) => <article className="plan-card" key={offering.id}><span className="course-code">{displayCourseCode(course)}</span><h3>{course.name}</h3><p>{weekdayLabels[offering.weekday]}曜 {offering.periods.join("・")}限 / クラス {offering.classCode}</p><small>{course.credits}単位・{labelRequirement(course)}{offering.lottery ? "・抽選" : ""}{offering.alternateWeeks ? "・隔週" : ""}</small><em>{profile.autoRequiredCourseIds.includes(course.id) ? "必修・固定" : priority === "must" ? "希望を優先" : priority === "prefer" ? "希望科目" : "配当期の候補"}</em></article>) : <p>条件に合う開講科目がありません。希望・修得履歴・空けたい時限を見直してください。</p>}</div>
    {profile.targetTermCredits !== null && plannedCredits < profile.targetTermCredits && <section className="recommendation-box"><div><p className="eyebrow">OPTIONAL RECOMMENDATIONS</p><h3>あと {profile.targetTermCredits - plannedCredits} 単位の候補</h3><p>履修案には自動追加しません。理由を確認してから「できれば取りたい」に追加してください。</p></div>{recommendations.length > 0 ? <div className="recommendation-list">{recommendations.map(({ course, offering, reasons }) => <article key={course.id} className="recommendation-card"><div><span className="course-code">{displayCourseCode(course)}</span><strong>{course.name}</strong><small>{course.credits}単位 / {weekdayLabels[offering.weekday]}曜 {offering.periods.join("・")}限{offering.lottery ? " / 抽選" : ""}</small><p>{reasons.join("・")}</p></div><button className="secondary-button" onClick={() => onAddRecommendation(course)}>できれば取りたいに追加</button></article>)}</div> : <p className="recommendation-empty">現在の時間割・上限・先修条件を満たした追加候補はありません。空き希望または目標単位を見直してください。</p>}</section>}
    {plan.warnings.length > 0 && <div className="notice warning-box"><strong>注意</strong><ul>{plan.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
    {plan.rejected.length > 0 && <div className="notice"><strong>選べなかった希望科目</strong><ul>{plan.rejected.map(({ course, reasons }) => <li key={course.id}><b>{course.name}</b>: {reasons.join(" ")}</li>)}</ul></div>}
    <p className="disclaimer">この結果は計画支援です。最終的な履修可否は、最新の公式資料と大学の履修登録画面で確認してください。</p>
  </section>;
}

function Rules({ dataset }: { dataset: Dataset }) {
  const p = dataset.policies;
  return <section className="rules-page"><div className="section-heading standalone"><div><p className="eyebrow">RULE ENGINE</p><h1>{dataset.program.entryDate}入学 / {dataset.program.code}の判定ルール</h1><p>表示値はバージョン管理されたデータセットから読み込みます。画面コードへ直接埋め込みません。</p></div><span className="pill">{dataset.datasetVersionId}</span></div>
    <div className="rules-grid"><article className="section-card"><h2>履修上限</h2><dl><dt>学期</dt><dd>{p.termCap}単位</dd><dt>年間（通常）</dt><dd>{p.normalAnnualCap}単位</dd><dt>年間（GPA優遇）</dt><dd>{p.honorsAnnualCap}単位</dd><dt>優遇条件</dt><dd>進級時GPA {p.honorsGpaThreshold}以上</dd></dl><p className="callout">一度52単位になった学生は、以後も52単位を維持します。通年科目は前期に全単位を算入します。</p></article>
      <article className="section-card"><h2>進級要件</h2><dl>{p.progression.map((rule) => <Fragment key={rule.toGrade}><dt>{rule.toGrade - 1}年次 → {rule.toGrade}年次</dt><dd>{rule.minCredits}単位以上{rule.minGpa !== undefined ? ` / GPA ${rule.minGpa}以上` : ""}</dd></Fragment>)}</dl></article>
      <article className="section-card"><h2>卒業要件</h2><dl><dt>専門教育科目</dt><dd>{p.graduation.specializedTotal}単位以上</dd><dt>総合教育科目</dt><dd>{p.graduation.generalTotal}単位以上</dd><dt>英語系科目</dt><dd>{p.graduation.english}単位以上</dd><dt>総計</dt><dd>{p.graduation.total}単位以上</dd></dl></article>
      <article className="section-card"><h2>科目間の関係</h2><p><b>実線</b>は前提条件です。すべての前提科目を過去学期までに修得していなければ登録できません。</p><p><b>破線</b>は推奨順序です。未修得でも登録禁止にはなりません。</p><p><b>同一科目</b>は、同じ学期に複数クラスを登録できません。</p></article>
    </div>
  </section>;
}
