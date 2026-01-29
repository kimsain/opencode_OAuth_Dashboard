# Quota Pulse Dashboard

<p align="center">
  <b>A Premium Electron Dashboard for OAuth Usage & Configuration Management</b>
</p>

## 🚀 Quick Start / 빠른 시작

1. **Install Node.js (LTS)** and npm.
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Start the app**:
   ```bash
   npm start
   ```
4. **Authenticate**: Click **Connect Codex** or **Connect Antigravity** in the dashboard.

---

## 💎 English

### Overview
**Quota Pulse** is a high-performance Electron desktop application designed to monitor quota and usage for OAuth-connected providers (Codex/OpenAI, Antigravity/Google). It features a world-class user interface inspired by modern glassmorphic design principles, providing both real-time data visualization and deep configuration management.

### ✨ What's New
- **Configuration Editor**: Directly manage your `oh-my-opencode.json` within the app.
  - **Dynamic Loading**: Automatically detects your config path across OS environments.
  - **Bulk Replace**: Swap models across all agents/categories with a single click.
  - **Role Descriptions**: Integrated documentation-based descriptions for every agent and category.
- **Premium Design System**:
  - **Glassmorphism**: Layered blur effects and translucent materials.
  - **Paper Texture**: SVG-based noise filtering for a refined, non-digital feel.
  - **Micro-interactions**: Staggered entry/exit animations and bouncy spring motions.

### Key Features
- **Real-time Monitoring**: Auto-refresh every 60s with manual override.
- **Multi-view Support**: Switch between Model-based and Category-based layouts.
- **Bilingual Interface**: Seamlessly handles English and Korean contexts.
- **Safe Management**: Atomic writes and automatic backups for configuration safety.

---

## 🇰🇷 한국어

### 개요
**Quota Pulse**는 OAuth로 연결된 제공자(Codex/OpenAI, Antigravity/Google)의 사용량과 쿼터를 모니터링하기 위한 프리미엄 Electron 데스크톱 앱입니다. 현대적인 글래스모피즘(Glassmorphism) 디자인 원칙을 적용하여, 실시간 데이터 시각화와 정교한 설정 관리를 동시에 제공합니다.

### ✨ 새로운 기능
- **Configuration Editor**: 앱 내에서 `oh-my-opencode.json`을 직접 편집할 수 있습니다.
  - **동적 로딩**: OS 환경에 맞춰 설정 파일 경로를 자동으로 탐색합니다.
  - **일괄 변경 (Bulk Replace)**: 단 한 번의 클릭으로 모든 Agent/Category의 모델을 교체합니다.
  - **역할 설명**: 각 항목의 역할을 문서 기반 영어 설명으로 즉시 확인 가능합니다.
- **프리미엄 디자인 시스템**:
  - **글래스모피즘**: 레이어드 블러 효과와 반투명 재질감을 적용했습니다.
  - **종이 질감**: SVG 노이즈 필터를 통해 디지털 특유의 매끈함 대신 고급스러운 질감을 더했습니다.
  - **마이크로 인터랙션**: 순차적 등장/퇴장 애니메이션과 쫀득한 탄성 모션을 구현했습니다.

### 주요 기능
- **실시간 모니터링**: 60초 자동 갱신 및 수동 새로고침 지원.
- **멀티 뷰 지원**: 모델별 뷰와 카테고리별 레이아웃 전환 가능.
- **이중 언어 지원**: 영어와 한국어 컨텍스트를 깔끔하게 처리합니다.
- **안전한 관리**: 설정 변경 시 원자적 저장(Atomic Write) 및 자동 백업을 수행합니다.

---

## 🛠 Technical Details
- **Stack**: Electron, JavaScript (CommonJS), CSS3 (Variables + Filters).
- **Security**: Aggressive token redaction; secrets are never logged or exposed via IPC.
- **Layout**: CSS Grid/Flexbox with responsive breakpoints.

## 🔒 Security Note
- **Never commit** `app.config.json` or credential files (`auth.json`, etc.).
- The app uses `contextIsolation: true` for secure renderer-main communication.
