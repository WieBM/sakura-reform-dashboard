---
description: git push 전 사전 체크리스트 — 과거 실수 패턴을 검증하고 누락 항목을 수정한 뒤 커밋/푸시
allowed-tools: [Read, Glob, Grep, Bash, PowerShell, Edit, Write]
---

# /wrap-up — セッション終了前チェック

このコマンドは git push 前に実行し、過去に発生した実수 패턴을 자동으로 검증합니다.
레퍼런스: `.claude/commands/references/past-mistakes.md`

## 실행 절차

아래 5개 체크를 순서대로 실행하고, 문제가 발견되면 즉시 수정한 뒤 결과를 보고하세요.

---

### CHECK 1 — CLAUDE.md 업데이트 여부

```
git diff HEAD~1..HEAD -- CLAUDE.md
```

- 이번 세션에서 변경된 파일 목록을 `git diff --name-only HEAD~1..HEAD` 로 확인
- 다음 중 하나라도 변경되었다면 CLAUDE.md도 반드시 업데이트되어야 합니다:
  - `dashboard/server.js` (API 동작 변경, 신규 엔드포인트)
  - `dashboard/public/index.html` (신규 함수, 프론트엔드 패턴 변경)
  - `dashboard/db.js` (스키마 변경)
  - `.claude/agents/*.md` (에이전트 추가/변경)
- CLAUDE.md가 변경되지 않았다면 → **누락 여부를 판단하고 필요하면 업데이트**

---

### CHECK 2 — 리포트 파일명 규칙 준수

`dashboard/claude-reports/` 내 모든 파일을 확인:

```
Glob: dashboard/claude-reports/**
```

**규칙**: 모든 리포트 파일명은 `TYPE_YYYY-MM-DD.md` 형식 (대문자 + 언더스코어 + 날짜)

| 허용 | 위반 예시 |
|------|----------|
| `BUG_REPORT_2026-06-25.md` | `bug_report.md` ← 날짜 없음 |
| `FIX_REPORT_2026-06-25.md` | `fix-report-2026-06-25.md` ← 소문자+하이픈 |
| `AUDIT_REPORT_2026-06-25.md` | `ux-audit-report-2026-06-25.md` ← 타입 불일치 |

위반 파일 발견 시 → **즉시 Rename-Item 으로 수정**

---

### CHECK 3 — BUG_REPORT / FIX_REPORT 쌍 일치 여부

BUG_REPORT_N 이 존재하면 대응하는 FIX_REPORT_N 도 반드시 존재해야 합니다.

- `dashboard/claude-reports/BUG_REPORT_*.md` 목록 수집
- 각 BUG_REPORT_N 에 대해 `FIX_REPORT_N` 이 있는지 확인
- 누락된 쌍 발견 시 → **FIX_REPORT 파일을 생성** (버그 수정이 완료된 경우)

---

### CHECK 4 — git 상태 확인

```
git status
git diff --stat HEAD
```

- 스테이징되지 않은 변경 파일이 있으면 보고
- 변경 내용이 커밋 메시지와 일치하는지 확인
- 미커밋 상태의 리포트 파일이 있으면 스테이징

---

### CHECK 5 — README.md 파일 목록 동기화

`dashboard/claude-reports/README.md` 의 파일 목록이 실제 파일과 일치하는지 확인:

- 새로 추가된 리포트 파일이 README 목록에 없으면 → **README에 추가**
- 삭제/리네임된 파일이 README에 남아 있으면 → **README에서 제거**

---

## 최종 보고 형식

체크 완료 후 아래 형식으로 결과를 출력하세요:

```
## /wrap-up 체크 결과

| # | 체크 항목 | 결과 | 조치 |
|---|-----------|------|------|
| 1 | CLAUDE.md 업데이트 | ✅ / ⚠️ 누락 | (수정 내용 또는 "이상 없음") |
| 2 | 리포트 파일명 규칙 | ✅ / ⚠️ N건 위반 | (수정 내용 또는 "이상 없음") |
| 3 | BUG/FIX 리포트 쌍 | ✅ / ⚠️ 누락 | (생성 내용 또는 "이상 없음") |
| 4 | git 상태 | ✅ / ⚠️ 미스테이징 | (파일 목록 또는 "이상 없음") |
| 5 | README 동기화 | ✅ / ⚠️ 불일치 | (수정 내용 또는 "이상 없음") |

**전체 결과: ✅ push 가능 / ⚠️ N건 수정 완료 후 push 가능**
```
