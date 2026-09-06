# AIT KK 履修てだすけ

愛知工業大学・情報科学部・コンピュータシステム専攻（KK）向けの、教育課程データ生成（ツール1）と履修計画支援（ツール2）のMVPです。

## セキュリティ方針

- 初回の新規登録にはFirebase Secret `APP_ACCESS_PASSWORD`（共通アクセスパスワード）を使います。Reactの環境変数、Git、ブラウザのJavaScriptには保存しません。
- 登録後は、利用者IDと個人用パスワードでログインします。個人用パスワードはランダムなソルトを付けて`scrypt`でハッシュ化し、平文では保存しません。
- Cloud Functionsはログインに成功した利用者だけへFirebase Custom Tokenを発行します。Firestoreの履修データはUIDごとに分離され、他の利用者のデータは読めません。
- プロフィール（修得履歴、希望、空き希望、抽選状況など）、卒業計画、保存前の卒業目標の編集内容、番号付き保存プラン、最後に開いていた画面をユーザーごとに自動保存・復元します。
- 旧版の端末ごとの保存データは、その端末で最初に新規登録したアカウントへ一度だけ引き継ぎます。
- このリポジトリはGitHub上で**private**として作成します。

## 開発

```bash
npm install
npm run dev
cd functions && npm install && npm run build
```

Firebaseの値は`.env.local`へ設定します。`.env.local`はGitに追加してはいけません。

## デプロイ前に必要な秘密情報

```bash
firebase functions:secrets:set APP_ACCESS_PASSWORD
```

AI抽出を有効化するには、OpenAI APIキーとAI処理関数のデプロイ設定が別途必要です。キーは決してフロントエンドへ設定しません。

## 制限

ツール1の画面とデータ契約は実装済みですが、PDF・画像をAIで解析する本稼働には別途AI APIキーが必要です。秘密情報が未設定の状態では、資料を外部へ送信せず「AI API未設定」として止まります。
