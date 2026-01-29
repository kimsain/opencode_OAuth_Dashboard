# OAuth Usage Dashboard

Quick start (for first-time users)

1) Install Node.js (LTS) and npm.
2) Open a terminal in this folder.
3) Install dependencies:
   - `npm install`
4) Start the app:
   - `npm start`
5) In the app, click **Connect Codex** or **Connect Antigravity** to authenticate.

---

## English

### What this is
An Electron desktop dashboard that shows quota/usage for OAuth-connected providers.
It reads local OpenCode credential files and refreshes data every minute (plus manual refresh).

### Features
- Codex (OpenAI) and Antigravity (Google) support
- Auto refresh every 60s + manual refresh
- Model view and category view
- Sample mode and sample fallback when OAuth is unavailable

### Configuration
Runtime config is `app.config.json` (strict JSON; no comments).
Use `app.config.example.json` as a template.

Key keys:
- `dataMode`: `oauth` | `api` | `sample`
- `enableSampleFallback`: boolean
- `refreshIntervalMs`: number

### OAuth connect ports
- Codex callback: `http://localhost:1455/auth/callback`
- Antigravity callback: `http://localhost:51121/oauth-callback`

If Codex connect fails, check if OpenCode/Codex CLI is already using port 1455.

### Data flow (high level)
1) Renderer calls `window.usageApi.fetchUsage()`
2) Main process returns `{ status, source, fetchedAt, items, refreshIntervalMs, providerErrors?, accountInfo? }`
3) Renderer shows banners/errors + cards

### Security notes
- Do not commit `app.config.json` or any credential files.
- Never log or share tokens, refresh tokens, or auth codes.

---

## 한국어

### 무엇인가요
OAuth로 연결된 제공자의 사용량/쿼터를 보여주는 Electron 데스크톱 대시보드입니다.
로컬 OpenCode 자격 증명 파일을 읽고 1분마다 자동 갱신하며, 수동 갱신도 가능합니다.

### 주요 기능
- Codex(OpenAI), Antigravity(Google) 지원
- 60초 자동 갱신 + 수동 갱신
- 모델/카테고리 보기 전환
- OAuth 실패 시 샘플 모드 및 샘플 폴백

### 설정
실행 설정은 `app.config.json` (엄격한 JSON, 주석 불가)입니다.
`app.config.example.json`을 템플릿으로 사용하세요.

주요 키:
- `dataMode`: `oauth` | `api` | `sample`
- `enableSampleFallback`: boolean
- `refreshIntervalMs`: number

### OAuth 콜백 포트
- Codex 콜백: `http://localhost:1455/auth/callback`
- Antigravity 콜백: `http://localhost:51121/oauth-callback`

Codex 연결이 실패하면 1455 포트가 이미 사용 중인지 확인하세요.

### 데이터 흐름 (요약)
1) Renderer가 `window.usageApi.fetchUsage()` 호출
2) Main 프로세스가 `{ status, source, fetchedAt, items, refreshIntervalMs, providerErrors?, accountInfo? }` 반환
3) Renderer가 배너/오류 + 카드 렌더링

### 보안 주의사항
- `app.config.json`과 자격 증명 파일은 커밋하지 마세요.
- 토큰/리프레시 토큰/인증 코드를 로그나 공유하지 마세요.
