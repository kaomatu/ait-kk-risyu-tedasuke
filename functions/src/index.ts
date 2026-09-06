import { createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 既に公開済みのKKデータセットへ、2026年度教育課程表117頁の言語系8単位要件を一度だけ補う。
 * 科目マスタ全体を置き換えず、該当18科目の判定タグと卒業要件だけを更新するため、利用者の既存データを保つ。
 */
function needsKkLanguageRequirementMigration(dataset: Record<string, unknown>) {
  const program = isRecord(dataset.program) ? dataset.program : null;
  const policies = isRecord(dataset.policies) ? dataset.policies : null;
  const graduation = policies && isRecord(policies.graduation) ? policies.graduation : null;
  return program?.code === "KK" && typeof graduation?.language !== "number";
}

function migrateKkLanguageRequirement(dataset: Record<string, unknown>) {
  const sourceLanguageTags = new Map(
    createKkSeedDataset().courses
      .filter((course) => course.tags?.includes("graduation_language"))
      .map((course) => [course.id, course.tags]),
  );
  const courses = Array.isArray(dataset.courses)
    ? dataset.courses.map((course) => {
      if (!isRecord(course)) return course;
      const tags = typeof course.id === "string" ? sourceLanguageTags.get(course.id) : undefined;
      return tags ? { ...course, tags } : course;
    })
    : dataset.courses;
  const policies = isRecord(dataset.policies) ? dataset.policies : {};
  const graduation = isRecord(policies.graduation) ? policies.graduation : {};
  const sourceStatus = typeof dataset.sourceStatus === "string" ? dataset.sourceStatus : "published_dataset";

  return {
    ...dataset,
    sourceStatus: `${sourceStatus}; language_8_credit_requirement_applied`,
    policies: { ...policies, graduation: { ...graduation, language: 8 } },
    courses,
  };
}

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

interface StoredWorkspace {
  activeTab: "overview" | "ingestion" | "graduation_planner" | "planner" | "rules";
  planGenerated: boolean;
  graduationPlanDraftTargetCourseIds: string[] | null;
}

interface StoredAccount {
  uid: string;
  username: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
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

function normalizeUsername(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function assertValidUsername(username: string) {
  if (!/^[a-z0-9_-]{3,32}$/.test(username)) {
    throw new HttpsError("invalid-argument", "利用者IDは英数字・ハイフン・アンダースコアを使い、3〜32文字で入力してください。");
  }
}

function assertValidAccountPassword(password: unknown): asserts password is string {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    throw new HttpsError("invalid-argument", "個人用パスワードは12〜128文字で入力してください。");
  }
}

function accountCredentialRef(username: string) {
  const accountId = createHash("sha256").update(username).digest("hex");
  return getFirestore().collection("accountCredentials").doc(accountId);
}

function deriveAccountPasswordHash(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

async function accountPasswordMatches(password: string, account: StoredAccount) {
  const actual = await deriveAccountPasswordHash(password, Buffer.from(account.passwordSalt, "hex"));
  const expected = Buffer.from(account.passwordHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function createAccountCustomToken(uid: string, username: string) {
  return getAuth().createCustomToken(uid, { appAccess: true, userAccount: true, username });
}

/**
 * 旧公開版を開いたままの利用者が、番号付き保存データを退避してから
 * 新アカウントへ移行できるようにする互換用の入口。新UIからは呼び出さない。
 */
export const authenticateWithPassphrase = onCall(
  { secrets: [APP_ACCESS_PASSWORD] },
  async (request) => {
    const remoteAddress = request.rawRequest.ip ?? "unknown";
    rateLimit(`legacy:${remoteAddress}`);
    const password = request.data && typeof request.data.password === "string" ? request.data.password : "";
    const deviceId = request.data && typeof request.data.deviceId === "string" ? request.data.deviceId : "";
    const expected = APP_ACCESS_PASSWORD.value().replace(/\r?\n$/, "");
    if (!password || !expected || !deviceId || deviceId.length > 128 || !passwordsMatch(password, expected)) {
      throw new HttpsError("permission-denied", "パスワードが正しくありません。");
    }
    const uid = `passphrase-${createHmac("sha256", expected).update(deviceId).digest("hex")}`;
    return { customToken: await getAuth().createCustomToken(uid, { appAccess: true, legacyAccess: true }) };
  },
);

/**
 * 旧バージョンは端末ごとの一時UIDで保存していた。旧セッションから初めて
 * アカウント登録する場合だけ、本人の既存データを新しいアカウントへ引き継ぐ。
 */
async function copyLegacyPlanningData(sourceUid: string | undefined, targetUid: string) {
  if (!sourceUid || sourceUid === targetUid) return false;
  const db = getFirestore();
  const sourceProfileRef = planningProfileRef(sourceUid);
  const [profileSnapshot, graduationSnapshot, snapshotsSnapshot] = await Promise.all([
    sourceProfileRef.get(),
    graduationPlanRef(sourceUid).get(),
    sourceProfileRef.collection("snapshots").get(),
  ]);

  const targetProfileRef = planningProfileRef(targetUid);
  const planningWrites = db.batch();
  let planningWriteCount = 0;
  if (profileSnapshot.exists) {
    planningWrites.set(targetProfileRef, profileSnapshot.data()!);
    planningWriteCount += 1;
  }
  if (graduationSnapshot.exists) {
    planningWrites.set(graduationPlanRef(targetUid), graduationSnapshot.data()!);
    planningWriteCount += 1;
  }
  if (planningWriteCount > 0) await planningWrites.commit();

  const targetSnapshots = targetProfileRef.collection("snapshots");
  for (let offset = 0; offset < snapshotsSnapshot.docs.length; offset += 400) {
    const batch = db.batch();
    for (const document of snapshotsSnapshot.docs.slice(offset, offset + 400)) {
      batch.set(targetSnapshots.doc(document.id), document.data());
    }
    await batch.commit();
  }
  return planningWriteCount > 0 || snapshotsSnapshot.docs.length > 0;
}

export const registerUserAccount = onCall(
  { secrets: [APP_ACCESS_PASSWORD] },
  async (request) => {
    const remoteAddress = request.rawRequest.ip ?? "unknown";
    rateLimit(`register:${remoteAddress}`);
    const data = request.data as Record<string, unknown> | undefined;
    const accessPassword = data?.accessPassword;
    const username = normalizeUsername(data?.username);
    const password = data?.password;
    // Firebase CLIの --data-file で登録した値に付く改行だけを除去する。
    // パスワード本文の空白は変更しない。
    const expected = APP_ACCESS_PASSWORD.value().replace(/\r?\n$/, "");

    if (typeof accessPassword !== "string" || !expected || !passwordsMatch(accessPassword, expected)) {
      throw new HttpsError("permission-denied", "パスワードが正しくありません。");
    }
    assertValidUsername(username);
    assertValidAccountPassword(password);

    const uid = `account-${randomUUID()}`;
    const salt = randomBytes(16);
    const passwordHash = await deriveAccountPasswordHash(password, salt);
    const account: StoredAccount = {
      uid,
      username,
      passwordSalt: salt.toString("hex"),
      passwordHash: passwordHash.toString("hex"),
      createdAt: new Date().toISOString(),
    };
    const credentialRef = accountCredentialRef(username);
    await getFirestore().runTransaction(async (transaction) => {
      const existing = await transaction.get(credentialRef);
      if (existing.exists) {
        throw new HttpsError("already-exists", "この利用者IDはすでに使われています。別のIDを入力してください。");
      }
      transaction.create(credentialRef, account);
    });

    const legacyUid = request.auth?.token.appAccess === true && request.auth?.token.userAccount !== true
      ? request.auth.uid
      : undefined;
    await copyLegacyPlanningData(legacyUid, uid);
    const customToken = await createAccountCustomToken(uid, username);
    return { customToken };
  },
);

export const loginWithUserAccount = onCall(async (request) => {
  const remoteAddress = request.rawRequest.ip ?? "unknown";
  const data = request.data as Record<string, unknown> | undefined;
  const username = normalizeUsername(data?.username);
  const password = data?.password;
  assertValidUsername(username);
  assertValidAccountPassword(password);
  rateLimit(`login:${remoteAddress}:${username}`);

  const accountSnapshot = await accountCredentialRef(username).get();
  const account = accountSnapshot.data() as Partial<StoredAccount> | undefined;
  if (!account || typeof account.uid !== "string" || account.username !== username
    || typeof account.passwordSalt !== "string" || typeof account.passwordHash !== "string"
    || !(await accountPasswordMatches(password, account as StoredAccount))) {
    throw new HttpsError("permission-denied", "利用者IDまたは個人用パスワードが正しくありません。");
  }
  return { customToken: await createAccountCustomToken(account.uid, account.username) };
});

export const getCatalog = onCall(async (request) => {
  assertAppAccess(request);
  const datasetRef = getFirestore().collection("datasets").doc(DATASET_ID);
  const snapshot = await datasetRef.get();
  const dataset = snapshot.data() as Record<string, unknown> | undefined;
  if (dataset && needsKkLanguageRequirementMigration(dataset)) {
    const migrated = migrateKkLanguageRequirement(dataset);
    await datasetRef.set({ ...migrated, updatedAt: new Date().toISOString(), seededBy: "server-language-requirement-migration" });
    return { dataset: migrated };
  }
  return { dataset: dataset ?? null };
});

/**
 * 元資料のカリキュラムツリーは静的ホスティングに置かず、アプリ認証済み利用者だけに返す。
 * __dirname は functions/lib を指し、build 時に assets が同じ階層へコピーされる。
 */
export const getKkCurriculumTreeImages = onCall(async (request) => {
  assertAppAccess(request);
  const assetDirectory = join(__dirname, "assets");
  const [page1, page2] = await Promise.all([
    readFile(join(assetDirectory, "kk2026-curriculum-tree-1.png")),
    readFile(join(assetDirectory, "kk2026-curriculum-tree-2.png")),
  ]);
  return { page1Base64: page1.toString("base64"), page2Base64: page2.toString("base64") };
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

function validWorkspace(value: unknown): value is StoredWorkspace {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Record<string, unknown>;
  return (workspace.activeTab === "overview"
      || workspace.activeTab === "ingestion"
      || workspace.activeTab === "graduation_planner"
      || workspace.activeTab === "planner"
      || workspace.activeTab === "rules")
    && typeof workspace.planGenerated === "boolean"
    && (workspace.graduationPlanDraftTargetCourseIds === null
      || (Array.isArray(workspace.graduationPlanDraftTargetCourseIds)
        && workspace.graduationPlanDraftTargetCourseIds.length <= 500
        && workspace.graduationPlanDraftTargetCourseIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 200)));
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
  return {
    profile: snapshot.exists ? snapshot.data()?.profile ?? null : null,
    workspace: snapshot.exists ? snapshot.data()?.workspace ?? null : null,
  };
});

export const saveStudentProfile = onCall(async (request) => {
  assertAppAccess(request);
  const profile = (request.data as Record<string, unknown> | undefined)?.profile;
  const workspace = (request.data as Record<string, unknown> | undefined)?.workspace;
  assertValidProfile(profile);
  if (!validWorkspace(workspace)) {
    throw new HttpsError("invalid-argument", "保存する作業画面の形式が正しくありません。");
  }
  await planningProfileRef(request.auth!.uid).set({
    profile,
    workspace,
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
