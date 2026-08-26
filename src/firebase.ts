import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithCustomToken, signOut, type Auth, type User } from "firebase/auth";
import { getFunctions, httpsCallable, type Functions } from "firebase/functions";
import type { Dataset } from "./types";

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
