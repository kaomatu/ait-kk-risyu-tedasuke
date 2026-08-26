# AIT KK 履修てだすけ

愛知工業大学・情報科学部・コンピュータシステム専攻（KK）向けの、教育課程データ生成（ツール1）と履修計画支援（ツール2）のMVPです。

## セキュリティ方針

- 共有パスワードはFirebase Secret `APP_ACCESS_PASSWORD`だけへ保存します。Reactの環境変数、Git、ブラウザのJavaScriptには保存しません。
- パスワードが検証されると、Cloud FunctionsがFirebase Custom Tokenを発行します。
- Firestoreは`appAccess`カスタムクレームを持つユーザーだけがカタログを読めます。
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
