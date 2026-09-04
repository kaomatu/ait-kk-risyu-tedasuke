import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithCustomToken, signOut, type Auth, type User } from "firebase/auth";
import { getFunctions, httpsCallable, type Functions } from "firebase/functions";
import type { Dataset, GraduationPlan, ProfileSnapshot, ProfileSnapshotSummary, StudentProfile } from "./types";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

const firebaseEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "asia-northeast1";

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let functions: Functions | undefined;

function getOrCreateDeviceId() {
  const key = "ait-kk-device-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(key, next);
  return next;
}

if (firebaseEnabled) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  functions = getFunctions(app, region);
}

export { firebaseEnabled };

export function subscribeToAuth(callback: (user: User | null) => void) {
  if (!auth) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(auth, callback);
}

export async function loginWithPassphrase(password: string) {
  if (!auth || !functions) throw new Error("Firebaseの接続設定が未完了です。");
  const authenticate = httpsCallable<{ password: string; deviceId: string }, { customToken: string }>(functions, "authenticateWithPassphrase");
  const response = await authenticate({ password, deviceId: getOrCreateDeviceId() });
  await signInWithCustomToken(auth, response.data.customToken);
}

export async function logout() {
  if (auth) await signOut(auth);
  sessionStorage.removeItem("ait-kk-local-preview-auth");
}

export async function loadCatalog(): Promise<Dataset | null> {
  if (import.meta.env.DEV && import.meta.env.VITE_LOCAL_PREVIEW_AUTH === "true") {
    const { mockCatalog } = await import("./mockCatalog");
    return mockCatalog;
  }
  if (!functions) throw new Error("Firebaseの接続設定が未完了です。");
  const getCatalog = httpsCallable<undefined, { dataset: Dataset | null }>(functions, "getCatalog");
  const response = await getCatalog();
  return response.data.dataset;
}

export async function createInitialKkDataset(): Promise<Dataset> {
  if (!functions) throw new Error("Firebaseの接続設定が未完了です。");
  const seedKkDataset = httpsCallable<undefined, { dataset: Dataset }>(functions, "seedKkDataset");
  return (await seedKkDataset()).data.dataset;
}

export async function createIngestionJob(payload: {
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  documentKind: string;
}) {
  if (!functions) throw new Error("Firebaseの接続設定が未完了です。");
  const createJob = httpsCallable<typeof payload, { jobId: string; status: string; note: string }>(functions, "createIngestionJob");
  return (await createJob(payload)).data;
}

export async function loadStudentProfile() {
  if (import.meta.env.DEV && import.meta.env.VITE_LOCAL_PREVIEW_AUTH === "true") return null;
  if (!functions) throw new Error("Firebaseの接続設定が未完了です。");
  const loadProfile = httpsCallable<undefined, { profile: unknown | null }>(functions, "loadStudentProfile");
  return (await loadProfile()).data.profile;
}

export async function saveStudentProfile(profile: unknown) {
  if (import.meta.env.DEV && import.meta.env.VITE_LOCAL_PREVIEW_AUTH === "true") {
    localStorage.setItem("ait-kk-local-preview-profile", JSON.stringify(profile));
    return;
  }
  if (!functions) throw new Error("Firebaseの接続設定が未完了です。");
  const saveProfile = httpsCallable<{ profile: unknown }, { saved: boolean }>(functions, "saveStudentProfile");
  await saveProfile({ profile });
}

const localGraduationPlanKey = "ait-kk-local-preview-graduation-plan";

function readLocalGraduationPlan(): GraduationPlan | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(localGraduationPlanKey) ?? "null");
    if (!value || typeof value !== "object") return null;
    const plan = value as Partial<GraduationPlan>;
    if (plan.schemaVersion !== 1 || typeof plan.datasetVersionId !== "string" || typeof plan.programCode !== "string"
      || !Array.isArray(plan.targetCourseIds) || !Array.isArray(plan.requiredCourseIds) || !Array.isArray(plan.recommendedCourseIds)
      || typeof plan.savedAt !== "string") return null;
    return plan as GraduationPlan;
  } catch {
    return null;
  }
}

/** ツール3で保存した卒業計画を読み込む。番号付きの今期履修案とは別の、1件の現行計画。 */
export async function loadGraduationPlan(): Promise<GraduationPlan | null> {
  if (import.meta.env.DEV && import.meta.env.VITE_LOCAL_PREVIEW_AUTH === "true") return readLocalGraduationPlan();
  if (!functions) throw new Error("Firebaseの接続設定が未完了です。");
  const loadPlan = httpsCallable<undefined, { plan: GraduationPlan | null }>(functions, "loadGraduationPlan");
  return (await loadPlan()).data.plan;
}

/** ツール3の三分類を、認証済み利用者本人の卒業計画として保存する。 */
export async function saveGraduationPlan(plan: GraduationPlan): Promise<GraduationPlan> {
  if (import.meta.env.DEV && import.meta.env.VITE_LOCAL_PREVIEW_AUTH === "true") {
    const saved = { ...plan, savedAt: new Date().toISOString() };
    localStorage.setItem(localGraduationPlanKey, JSON.stringify(saved));
    return saved;
  }
  if (!functions) throw new Error("Firebaseの接続設定が未完了です。");
  const savePlan = httpsCallable<{ plan: GraduationPlan }, { plan: GraduationPlan }>(functions, "saveGraduationPlan");
  return (await savePlan({ plan })).data.plan;
}

const localSnapshotKey = "ait-kk-local-preview-profile-snapshots";

function readLocalSnapshots(): ProfileSnapshot[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(localSnapshotKey) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is ProfileSnapshot => (
      Boolean(item)
      && typeof item === "object"
      && Number.isInteger((item as ProfileSnapshot).snapshotNo)
      && typeof (item as ProfileSnapshot).savedAt === "string"
      && Boolean((item as ProfileSnapshot).profile)
    ));
  } catch {
    return [];
  }
}

function writeLocalSnapshots(snapshots: ProfileSnapshot[]) {
  localStorage.setItem(localSnapshotKey, JSON.stringify(snapshots));
}

export async function listProfileSnapshots(): Promise<ProfileSnapshotSummary[]> {
  if (import.meta.env.DEV && import.meta.env.VITE_LOCAL_PREVIEW_AUTH === "true") {
    return readLocalSnapshots()
      .map(({ snapshotNo, savedAt }) => ({ snapshotNo, savedAt }))
      .sort((a, b) => b.snapshotNo - a.snapshotNo);
  }
  if (!functions) throw new Error("Firebaseの接続設定が未完了です。");
  const listSnapshots = httpsCallable<undefined, { snapshots: ProfileSnapshotSummary[] }>(functions, "listProfileSnapshots");
  return (await listSnapshots()).data.snapshots;
}

export async function saveProfileSnapshot(profile: StudentProfile): Promise<ProfileSnapshotSummary> {
  if (import.meta.env.DEV && import.meta.env.VITE_LOCAL_PREVIEW_AUTH === "true") {
    const snapshots = readLocalSnapshots();
    const snapshotNo = Math.max(0, ...snapshots.map((snapshot) => snapshot.snapshotNo)) + 1;
    const savedAt = new Date().toISOString();
    snapshots.push({ snapshotNo, savedAt, profile });
    writeLocalSnapshots(snapshots);
    return { snapshotNo, savedAt };
  }
  if (!functions) throw new Error("Firebaseの接続設定が未完了です。");
  const saveSnapshot = httpsCallable<{ profile: StudentProfile }, { snapshot: ProfileSnapshotSummary }>(functions, "saveProfileSnapshot");
  return (await saveSnapshot({ profile })).data.snapshot;
}

export async function loadProfileSnapshot(snapshotNo: number): Promise<ProfileSnapshot> {
  if (import.meta.env.DEV && import.meta.env.VITE_LOCAL_PREVIEW_AUTH === "true") {
    const snapshot = readLocalSnapshots().find((item) => item.snapshotNo === snapshotNo);
    if (!snapshot) throw new Error(`No. ${snapshotNo} の保存データが見つかりません。`);
    return snapshot;
  }
  if (!functions) throw new Error("Firebaseの接続設定が未完了です。");
  const loadSnapshot = httpsCallable<{ snapshotNo: number }, { snapshot: ProfileSnapshot }>(functions, "loadProfileSnapshot");
  return (await loadSnapshot({ snapshotNo })).data.snapshot;
}
