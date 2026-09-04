import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { createKkSeedDataset } from "./seed";

initializeApp();
setGlobalOptions({ region: "asia-northeast1", maxInstances: 10 });

const APP_ACCESS_PASSWORD = defineSecret("APP_ACCESS_PASSWORD");
const DATASET_ID = "ait-is-kk-entry2026";
const PASSWORD_WINDOW_MS = 60_000;
const MAX_LOGIN_ATTEMPTS = 8;
const loginAttempts = new Map<string, number[]>();

interface StoredProfile {
  currentGrade: number;
  term: "spring" | "fall";
  gpa: number | null;
  annualCapBonusLocked: boolean;
  completedCourseIds: string[];
  wanted: Record<string, "must" | "prefer">;
  futureGoalCourseIds?: string[];
  targetTermCredits?: number | null;
  autoRequiredCourseIds: string[];
  autoGraduationPlanWanted?: Record<string, "must" | "prefer">;
  rechallengeCourseIds: string[];
  lotteryStates: Record<string, "none" | "applied" | "lost" | "won">;
  hardBlockedSlots: string[];
  softBlockedSlots: string[];
  annualRegisteredCredits: number;
}

interface StoredGraduationPlan {
  schemaVersion: 1;
  datasetVersionId: string;
  programCode: string;
  targetCourseIds: string[];
  requiredCourseIds: string[];
  recommendedCourseIds: string[];
  savedAt: string;
}

interface ProfileSnapshotSummary {
  snapshotNo: number;
  savedAt: string;
}

function assertAppAccess(request: CallableRequest<unknown>) {
  if (request.auth?.token.appAccess !== true) {
    throw new HttpsError("unauthenticated", "この操作にはアプリへのアクセス認証が必要です。");
  }
}

function rateLimit(key: string) {
  const now = Date.now();
  const attempts = (loginAttempts.get(key) ?? []).filter((timestamp) => now - timestamp < PASSWORD_WINDOW_MS);
  if (attempts.length >= MAX_LOGIN_ATTEMPTS) {
    throw new HttpsError("resource-exhausted", "しばらく待ってから再試行してください。");
  }
  attempts.push(now);
  loginAttempts.set(key, attempts);
}

function passwordsMatch(received: string, expected: string) {
  const receivedHash = createHash("sha256").update(received).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(receivedHash, expectedHash);
}

export const authenticateWithPassphrase = onCall(
  { secrets: [APP_ACCESS_PASSWORD] },
  async (request) => {
    const remoteAddress = request.rawRequest.ip ?? "unknown";
    rateLimit(remoteAddress);
    const password = request.data && typeof request.data.password === "string" ? request.data.password : "";
    const deviceId = request.data && typeof request.data.deviceId === "string" ? request.data.deviceId : "";
    // Firebase CLIの --data-file で登録した値に付く改行だけを除去する。
    // パスワード本文の空白は変更しない。
    const expected = APP_ACCESS_PASSWORD.value().replace(/\r?\n$/, "");

    if (!password || !expected || !deviceId || deviceId.length > 128 || !passwordsMatch(password, expected)) {
      throw new HttpsError("permission-denied", "パスワードが正しくありません。");
    }

    const uid = `passphrase-${createHmac("sha256", expected).update(deviceId).digest("hex")}`;
    const customToken = await getAuth().createCustomToken(uid, { appAccess: true });
    return { customToken };
  },
);

export const getCatalog = onCall(async (request) => {
  assertAppAccess(request);
  const snapshot = await getFirestore().collection("datasets").doc(DATASET_ID).get();
  return { dataset: snapshot.exists ? snapshot.data() : null };
});

export const seedKkDataset = onCall(async (request) => {
  assertAppAccess(request);
  const dataset = createKkSeedDataset();
  await getFirestore().collection("datasets").doc(DATASET_ID).set({
    ...dataset,
    updatedAt: new Date().toISOString(),
    seededBy: request.auth?.uid,
  });
  return { dataset };
});

export const createIngestionJob = onCall(async (request) => {
  assertAppAccess(request);
  const data = request.data as Record<string, unknown>;
  const fileName = typeof data.fileName === "string" ? data.fileName.slice(0, 255) : "";
  const mimeType = typeof data.mimeType === "string" ? data.mimeType.slice(0, 100) : "";
  const byteLength = typeof data.byteLength === "number" ? data.byteLength : 0;
  const sha256 = typeof data.sha256 === "string" ? data.sha256.slice(0, 128) : "";
  const documentKind = typeof data.documentKind === "string" ? data.documentKind.slice(0, 80) : "unknown";

  if (!fileName || !mimeType || byteLength <= 0 || !sha256) {
    throw new HttpsError("invalid-argument", "資料メタデータが不足しています。");
  }

  const jobId = randomUUID();
  const job = {
    jobId,
    fileName,
    mimeType,
    byteLength,
    sha256,
    documentKind,
    programCode: "KK",
    status: "waiting_for_ai_api_configuration",
    createdAt: new Date().toISOString(),
    createdBy: request.auth?.uid,
    note: "元資料の送信・AI抽出は、OpenAI API Secretの設定後に有効化されます。",
  };
  await getFirestore().collection("ingestionJobs").doc(jobId).set(job);
  return job;
});

function validProfile(value: unknown): value is StoredProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Record<string, unknown>;
  return Number.isInteger(profile.currentGrade)
    && typeof profile.term === "string"
    && (profile.gpa === null || typeof profile.gpa === "number")
    && typeof profile.annualCapBonusLocked === "boolean"
    && Array.isArray(profile.completedCourseIds)
    && typeof profile.wanted === "object"
    && (profile.futureGoalCourseIds === undefined || Array.isArray(profile.futureGoalCourseIds))
    && (profile.targetTermCredits === undefined || profile.targetTermCredits === null || typeof profile.targetTermCredits === "number")
    && Array.isArray(profile.autoRequiredCourseIds)
    && (profile.autoGraduationPlanWanted === undefined || typeof profile.autoGraduationPlanWanted === "object")
    && Array.isArray(profile.rechallengeCourseIds)
    && typeof profile.lotteryStates === "object"
    && Array.isArray(profile.hardBlockedSlots)
    && Array.isArray(profile.softBlockedSlots)
    && typeof profile.annualRegisteredCredits === "number";
}

function validCourseIdList(value: unknown) {
  return Array.isArray(value)
    && value.length <= 500
    && value.every((id) => typeof id === "string" && id.length > 0 && id.length <= 200);
}

function validGraduationPlan(value: unknown): value is StoredGraduationPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Record<string, unknown>;
  return plan.schemaVersion === 1
    && typeof plan.datasetVersionId === "string" && plan.datasetVersionId.length > 0 && plan.datasetVersionId.length <= 200
    && typeof plan.programCode === "string" && plan.programCode.length > 0 && plan.programCode.length <= 100
    && validCourseIdList(plan.targetCourseIds)
    && validCourseIdList(plan.requiredCourseIds)
    && validCourseIdList(plan.recommendedCourseIds)
    && typeof plan.savedAt === "string";
}

function assertValidGraduationPlan(value: unknown): asserts value is StoredGraduationPlan {
  if (!validGraduationPlan(value) || JSON.stringify(value).length > 40_000) {
    throw new HttpsError("invalid-argument", "保存する卒業計画の形式が正しくありません。");
  }
  const plan = value;
  const allIds = [...plan.targetCourseIds, ...plan.requiredCourseIds, ...plan.recommendedCourseIds];
  if (new Set(allIds).size !== allIds.length) {
    throw new HttpsError("invalid-argument", "卒業計画の科目が複数の区分に重複しています。");
  }
}

function assertValidProfile(value: unknown): asserts value is StoredProfile {
  if (!validProfile(value)) {
    throw new HttpsError("invalid-argument", "保存するプロフィールの形式が正しくありません。");
  }
  if (JSON.stringify(value).length > 40_000) {
    throw new HttpsError("invalid-argument", "プロフィールのサイズが上限を超えています。");
  }
}

function planningProfileRef(uid: string) {
  return getFirestore().collection("users").doc(uid).collection("planning").doc("profile");
}

function graduationPlanRef(uid: string) {
  return getFirestore().collection("users").doc(uid).collection("planning").doc("graduationPlan");
}

function snapshotDocumentId(snapshotNo: number) {
  return `no-${String(snapshotNo).padStart(6, "0")}`;
}

function requestedSnapshotNo(value: unknown) {
  if (!Number.isInteger(value) || typeof value !== "number" || value < 1 || value > 9_999_999) {
    throw new HttpsError("invalid-argument", "読み込む保存番号が正しくありません。");
  }
  return value;
}

export const loadStudentProfile = onCall(async (request) => {
  assertAppAccess(request);
  const snapshot = await planningProfileRef(request.auth!.uid).get();
  return { profile: snapshot.exists ? snapshot.data()?.profile ?? null : null };
});

export const saveStudentProfile = onCall(async (request) => {
  assertAppAccess(request);
  const profile = (request.data as Record<string, unknown> | undefined)?.profile;
  assertValidProfile(profile);
  await planningProfileRef(request.auth!.uid).set({
    profile,
    updatedAt: new Date().toISOString(),
  });
  return { saved: true };
});

export const loadGraduationPlan = onCall(async (request) => {
  assertAppAccess(request);
  const snapshot = await graduationPlanRef(request.auth!.uid).get();
  const plan = snapshot.exists ? snapshot.data()?.plan : null;
  if (plan !== null && !validGraduationPlan(plan)) {
    throw new HttpsError("data-loss", "保存済み卒業計画の形式が正しくありません。");
  }
  return { plan };
});

export const saveGraduationPlan = onCall(async (request) => {
  assertAppAccess(request);
  const plan = (request.data as Record<string, unknown> | undefined)?.plan;
  assertValidGraduationPlan(plan);
  const savedAt = new Date().toISOString();
  const savedPlan: StoredGraduationPlan = { ...plan, savedAt };
  await graduationPlanRef(request.auth!.uid).set({
    plan: savedPlan,
    updatedAt: savedAt,
  });
  return { plan: savedPlan };
});

export const saveProfileSnapshot = onCall(async (request) => {
  assertAppAccess(request);
  const profile = (request.data as Record<string, unknown> | undefined)?.profile;
  assertValidProfile(profile);

  const profileRef = planningProfileRef(request.auth!.uid);
  const snapshots = profileRef.collection("snapshots");
  const counterRef = snapshots.doc("_counter");
  const snapshot = await getFirestore().runTransaction(async (transaction) => {
    const counter = await transaction.get(counterRef);
    const lastSnapshotNo = counter.exists && typeof counter.data()?.lastSnapshotNo === "number"
      ? counter.data()!.lastSnapshotNo
      : 0;
    const snapshotNo = lastSnapshotNo + 1;
    const savedAt = new Date().toISOString();
    transaction.set(snapshots.doc(snapshotDocumentId(snapshotNo)), {
      kind: "profile_snapshot",
      snapshotNo,
      savedAt,
      profile,
    });
    transaction.set(counterRef, {
      kind: "profile_snapshot_counter",
      lastSnapshotNo: snapshotNo,
      updatedAt: savedAt,
    }, { merge: true });
    return { snapshotNo, savedAt } satisfies ProfileSnapshotSummary;
  });
  return { snapshot };
});

export const listProfileSnapshots = onCall(async (request) => {
  assertAppAccess(request);
  const snapshots = await planningProfileRef(request.auth!.uid)
    .collection("snapshots")
    .where("kind", "==", "profile_snapshot")
    .get();
  const items = snapshots.docs
    .map((document) => document.data())
    .filter((item): item is ProfileSnapshotSummary => (
      typeof item.snapshotNo === "number"
      && Number.isInteger(item.snapshotNo)
      && typeof item.savedAt === "string"
    ))
    .map(({ snapshotNo, savedAt }) => ({ snapshotNo, savedAt }))
    .sort((a, b) => b.snapshotNo - a.snapshotNo);
  return { snapshots: items };
});

export const loadProfileSnapshot = onCall(async (request) => {
  assertAppAccess(request);
  const snapshotNo = requestedSnapshotNo((request.data as Record<string, unknown> | undefined)?.snapshotNo);
  const snapshot = await planningProfileRef(request.auth!.uid).collection("snapshots").doc(snapshotDocumentId(snapshotNo)).get();
  if (!snapshot.exists || snapshot.data()?.kind !== "profile_snapshot") {
    throw new HttpsError("not-found", `No. ${snapshotNo} の保存データが見つかりません。`);
  }
  const data = snapshot.data()!;
  if (!validProfile(data.profile) || typeof data.savedAt !== "string") {
    throw new HttpsError("data-loss", "保存データの形式が正しくありません。");
  }
  return {
    snapshot: {
      snapshotNo,
      savedAt: data.savedAt,
      profile: data.profile,
    },
  };
});
