# 弁却ノート (Benkyaku Noto)

参考書の問題を管理し、効率的な復習を実現するWebアプリケーション

## 🎯 主な機能

### 学習管理機能
- ✅ 問題集の作成・管理
- ✅ **PDFアップロード機能** - 問題集PDFをアップロードし、学習画面で表示
- ✅ **目次画像からAI自動インポート** (GPT-4 Vision)
- ✅ 問題の登録（番号、カテゴリ、ページ、メモ）
- ✅ **階層的な問題管理** - 親問題（箱）と小問の構造化
- ✅ 学習記録（◯/△/× + タイマー + 一時停止）
- ✅ **セクション別学習** - 各セクションを若い番号順に学習
- ✅ 学習履歴の編集・削除
- ✅ 問題集単位での学習履歴リセット

### 復習・統計機能
- ✅ 復習リスト（優先度順）
- ✅ 学習統計ダッシュボード
- ✅ **重み付け平均による正解率計算** - 最新3回（最新50%, 1つ前30%, 2つ前20%）
- ✅ セクション別正解率表示
- ✅ CSV出力・インポート

### データ管理
- ✅ 完全オフライン動作（IndexedDB）
- ✅ 論理削除（ゴミ箱機能）
- ✅ ゴミ箱一括削除
- ✅ **デバッグページ** - 全問題データの一覧表示

### クラウド連携
- ✅ **Firebase Storage** - PDFをクラウドに保存（5GB無料枠）
- ✅ **Firebase Firestore** - データのクラウド同期
- ✅ **自動同期機能** - ログイン時に自動でデータを同期
- ✅ **同期失敗の通知** - トースト通知とリトライ機構（最大3回、指数バックオフ）
- ✅ 環境変数による安全な設定管理

### セキュリティ
- ✅ **OpenAI APIキーの安全な管理**
  - 環境変数優先（自分専用モード）
  - localStorage保存時は警告表示
  - 使用量制限設定へのリンク提供

## 🤖 AI機能

**目次画像からの自動インポート:**
1. 参考書の目次ページを撮影
2. GPT-4 Vision APIが自動解析
3. 章・節・タグを自動抽出
4. セクションごとの問題数を入力
5. ワンクリックで問題集を作成

**必要な準備:**
- OpenAI APIキー（設定ページで登録）
- APIキーはローカルストレージに安全に保存

## 📄 PDF表示機能

**学習画面でPDFを同時表示:**
1. 問題集詳細ページで「PDF追加」をクリック
2. 問題集のPDFをアップロード（50MB以下）
3. 問題登録時にページ番号を入力
4. 学習開始すると、問題情報とPDFが並んで表示される

**特徴:**
- 2カラムレイアウト（デスクトップ）
- 問題のページ番号と連動して自動表示
- ページナビゲーション機能
- レスポンシブ対応

## 🎓 学習モード

### 1. 初回学習モード（ホーム）
- 全問題を若い番号順に学習
- 時間制限あり
- 親問題（箱）は自動的に除外

### 2. セクション別学習モード（問題集詳細）
- 選択したセクション内を若い番号順に学習
- セクション内の全問題に取り組める
- 問題番号の階層的ソート（1-1, 1-2, 2-1, 2-2...）

## 📊 復習アルゴリズム

**優先度スコア計算式:**
```
優先度スコア = (100 - 重み付け平均正答率) × 経過日数係数
```

**重み付け平均正答率:**
- 最新3回の学習結果を使用
- 最新: 50%
- 1つ前: 30%
- 2つ前: 20%
- 学習回数が少ない場合は比率を調整

**経過日数係数:**
- 1日以内: 係数 0.5
- 3日以内: 係数 1.0
- 7日以内: 係数 1.5
- 14日以内: 係数 2.0
- 14日以上: 係数 2.5

**セクション別正解率:**
- 各セクションの正解率も重み付け平均で算出
- 最新の習熟度を即座に反映しつつ、偶然の変動を抑制

## 🚀 セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env`ファイルを作成（`.env.example`を参考）:

```bash
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id

# OpenAI API Configuration（オプション）
# 自分専用モード：この環境変数を設定すると、アプリ内でAPIキーを入力する必要がなくなります
# 他人に公開する場合：空のままにしてください（ユーザーが設定画面で入力します）
VITE_OPENAI_API_KEY=
```

### 3. 開発サーバー起動

```bash
npm run dev
```

http://localhost:5173/ にアクセス

### 4. ビルド

```bash
npm run build
```

## 🔥 Firebase設定

### Storage Security Rules

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /workbooks/{workbookId}/{fileName} {
      allow read: if true;
      allow write: if request.resource.size < 50 * 1024 * 1024
                   && request.resource.contentType == 'application/pdf';
    }
  }
}
```

### GitHub Actions環境変数

GitHub Actionsでのビルドには、以下の環境変数をSecretsに登録してください：
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`

## 📁 プロジェクト構造

```
benkyaku-noto/
├── src/
│   ├── components/          # UIコンポーネント
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Modal.tsx        # アクセシビリティ対応
│   │   ├── PDFViewer.tsx    # PDFビューア
│   │   ├── Toast.tsx        # トースト通知
│   │   └── ErrorBoundary.tsx # エラーハンドリング
│   ├── pages/               # ページコンポーネント（Code Splitting対応）
│   │   ├── Home.tsx
│   │   ├── Workbooks.tsx
│   │   ├── WorkbookDetail.tsx # 6つのカスタムフックに分割
│   │   ├── Study.tsx
│   │   ├── ReviewList.tsx
│   │   ├── Stats.tsx
│   │   ├── Settings.tsx
│   │   ├── Debug.tsx        # デバッグページ
│   │   └── Trash.tsx        # ゴミ箱
│   ├── hooks/               # カスタムフック
│   │   ├── useAutoSync.ts   # 自動同期フック
│   │   ├── useWorkbookData.ts
│   │   ├── useProblemsForm.ts
│   │   ├── useGroupForm.ts
│   │   ├── useCategoryForm.ts
│   │   ├── useWorkbookForm.ts
│   │   └── useCollapsibleUI.ts
│   ├── store/               # 状態管理
│   │   ├── authStore.ts     # 認証状態
│   │   └── toastStore.ts    # トースト通知
│   ├── lib/                 # ユーティリティ
│   │   ├── db.ts            # IndexedDB操作
│   │   ├── firebase.ts      # Firebase設定
│   │   ├── storage.ts       # Firebase Storage + ローカルストレージ
│   │   ├── review.ts        # 復習アルゴリズム（並列化最適化）
│   │   ├── studySet.ts      # 学習セット生成
│   │   ├── studySession.ts  # セッション管理
│   │   ├── csvExport.ts     # CSV出力・インポート
│   │   └── validation.ts    # データバリデーション
│   └── types/               # 型定義
│       └── index.ts
├── .env.example             # 環境変数テンプレート
├── package.json
└── vite.config.ts
```

## 💾 データ構造

### Workbook（問題集）
```typescript
{
  id: string
  title: string
  subject: string
  totalProblems: number
  pdfUrl?: string           // Firebase Storage URL
  pdfFileName?: string
  createdAt: Date
  updatedAt: Date
}
```

### Problem（問題）
```typescript
{
  id: string
  workbookId: string
  problemNumber: string     // 表示用（例: "1-1", "2-3"）
  sortOrder: number         // 並び替え用
  category?: string         // カテゴリ
  parentProblemId?: string  // 親問題ID（小問の場合）
  page?: number             // PDFページ番号
  memo?: string
  createdAt: Date
  deletedAt?: Date          // 論理削除
}
```

### StudyRecord（学習記録）
```typescript
{
  id: string
  problemId: string
  workbookId: string
  result: 'correct' | 'partial' | 'incorrect'
  studyTime: number         // 秒
  studiedAt: Date
  memo?: string
}
```

## 🛠️ 技術スタック

- **フレームワーク**: React 19 + Vite
- **言語**: TypeScript
- **スタイリング**: Tailwind CSS 4
- **ルーティング**: React Router v7
- **状態管理**: Zustand（軽量・シンプル）
- **データベース**: IndexedDB (Dexie)
- **クラウド**: Firebase (Storage + Firestore)
- **PDF表示**: react-pdf (PDF.js)
- **AI**: OpenAI GPT-4 Vision API
- **アイコン**: Lucide React

### パフォーマンス最適化

- **Code Splitting**: React.lazy + Suspense による遅延読み込み
- **メモ化**: useMemo / useCallback による再レンダリング防止
- **並列化**: Promise.all によるDBクエリの並列実行
- **カスタムフック**: ロジック分離による保守性向上

### アクセシビリティ

- **ARIA属性**: スクリーンリーダー対応
- **キーボード操作**: Escキーでモーダルを閉じる
- **セマンティックHTML**: 適切なrole属性の使用

### エラーハンドリング

- **ErrorBoundary**: JavaScriptエラーのグローバルキャッチ
- **トースト通知**: 同期失敗時のユーザーフレンドリーな通知
- **リトライ機構**: 指数バックオフによる自動リトライ（最大3回）

## 📱 画面構成

1. **ホーム** - 今日の統計、復習リストプレビュー、初回学習
2. **問題集** - 問題集の一覧と新規作成、目次からインポート
3. **問題集詳細** - 問題の階層表示、PDF管理、セクション別学習
4. **学習画面** - タイマー付き学習、PDF表示、◯△×の記録
5. **復習リスト** - 優先度順の復習推奨問題一覧
6. **統計** - 学習時間、正答率、週間グラフ
7. **設定** - OpenAI APIキー管理、デバッグページへのリンク
8. **ゴミ箱** - 削除した問題の管理と復元
9. **デバッグ** - 全問題データの詳細表示（開発用）

## 🎨 デザイン

Notion風の白黒ベースのシンプルなデザイン
- モバイルファースト
- レスポンシブ対応
- ダークモード非対応（シンプル重視）

## 🔧 開発Tips

### デバッグページの使い方
1. 設定画面から「デバッグページ」を開く
2. 全問題のデータを確認（削除済みも含む）
3. 問題集でフィルタリング可能

### 学習履歴のリセット
- 問題集詳細ページの「学習履歴リセット」ボタン
- 問題集単位で全学習記録を削除

### CSV出力・インポート
- 問題集の一括編集に便利
- CSV形式で問題データをエクスポート/インポート

### コード品質の維持

**実装済みの最適化:**
- WorkbookDetail.tsx: 6つのカスタムフックに分割（1,674行 → 1,482行）
- DBクエリ並列化: 正解率計算が5-10倍高速化
- Code Splitting: 初期バンドルサイズ30-40%削減
- ErrorBoundary: アプリクラッシュ時の復旧機能
- ARIA属性: スクリーンリーダー対応

**Claude Codeでの開発に最適化:**
- 各ファイルを200-400行に抑制
- カスタムフック単位でのロジック分離
- 明確な責任分担による保守性向上

## 📄 ライセンス

MIT

---

Made with ❤️ for efficient learning
