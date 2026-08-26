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
  rechallengeCourseIds: string[];
  lotteryStates: Record<string, "none" | "applied" | "lost" | "won">;
  hardBlockedSlots: string[];
  softBlockedSlots: string[];
  annualRegisteredCredits: number;
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
    const expected = APP_ACCESS_PASSWORD.value();

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
    && Array.isArray(profile.rechallengeCourseIds)
    && typeof profile.lotteryStates === "object"
    && Array.isArray(profile.hardBlockedSlots)
    && Array.isArray(profile.softBlockedSlots)
    && typeof profile.annualRegisteredCredits === "number";
}

export const loadStudentProfile = onCall(async (request) => {
  assertAppAccess(request);
  const snapshot = await getFirestore().collection("users").doc(request.auth!.uid).collection("planning").doc("profile").get();
  return { profile: snapshot.exists ? snapshot.data()?.profile ?? null : null };
});

export const saveStudentProfile = onCall(async (request) => {
  assertAppAccess(request);
  const profile = (request.data as Record<string, unknown> | undefined)?.profile;
  if (!validProfile(profile)) {
    throw new HttpsError("invalid-argument", "保存するプロフィールの形式が正しくありません。");
  }
  if (JSON.stringify(profile).length > 40_000) {
    throw new HttpsError("invalid-argument", "プロフィールのサイズが上限を超えています。");
  }
  await getFirestore().collection("users").doc(request.auth!.uid).collection("planning").doc("profile").set({
    profile,
    updatedAt: new Date().toISOString(),
  });
  return { saved: true };
});
