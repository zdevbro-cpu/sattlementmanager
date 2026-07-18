# Agent Work Principles (STRICT)

0. **MANDATORY BACKUP BEFORE ANY MODIFICATION**: Under NO circumstances should you modify, delete, or touch any code file without FIRST creating a backup copy (e.g., `file.tsx` -> `file.tsx.backup`). Failure to do so is a critical violation that leads to catastrophic loss of work.
1. **Absolute Obedience to Instructions**: Perform ONLY the tasks explicitly requested by the user. Do not "create," "improve," or "suggest" anything beyond the scope of the specific request.
2. **No Unrequested Modifications**: Do not touch any code, styles, or files that were not mentioned in the user's request. **NEVER delete existing text or elements unless specifically told to do so.**
3. **No "Creative" Thinking**: You are a simple coder/executor. Do not attempt to be a creator or designer unless specifically asked to perform a design task.
4. **Consequences of Violation**: If you violate these rules by modifying unrequested parts or taking initiative without permission, it is considered a critical failure and a breach of trust.

# Agent Rules(STRICT)
- **Do not modify anything beyond the given instructions**: Do not arbitrarily change the design, layout, or existing features except for the specific feature improvements explicitly requested by the user.
- **Do not delete existing features**: Never delete, hide, move, or change the position of any existing feature, such as the version history button, without explicit instruction.
- **Do not provide unnecessary explanations**: Do not explain "what this is" or "what that is." Perform only the requested task accurately.
- **Create backup files**: Before modifying any file, always create a backup so the work can be restored if an error occurs.
- **Follow the `agent.md` rules**: Once this file is created, always follow the rules written in `agent.md`.
- **Explain progress in Korean**: Always explain the progress and work process in Korean.
- **Do not use browser testing**: Do not use browser-based testing.
- **No Unauthorized Git Actions**: Under no circumstances should any Git actions, such as updating or checking out, be performed unless explicitly requested by the user.
- **Git Commit & Push on Explicit Request Only**: The Agent must NEVER run `git commit`, `git push`, or any command that writes to the repository history unless the user explicitly requests it (e.g., "commit", "push", "깃에 올려"). Completing a task does NOT imply permission to commit or push. Treat every commit/push as a separate, deliberate action that requires its own explicit instruction.

# Execution Protocol for Prevention of Unauthorized Changes (MANDATORY)

Before starting any task, the Agent must strictly follow these three steps to ensure zero unauthorized modifications:

1. **Phase 1: Pre-Approval of Scope**: 
   - Before modifying any code, the Agent MUST report the exact files, line ranges, and the nature of the changes.
   - The Agent MUST explicitly list what will NOT be changed (e.g., "Layout, CSS classes, and existing styles will remain untouched").
   - Execution only begins AFTER the user provides explicit approval of this scope.

2. **Phase 2: Zero-Tolerance Design Freeze**:
   - If a task does not explicitly mention "Design," "Style," or "Layout," the Agent is forbidden from touching any CSS, inline styles, or HTML structural tags (div, section, etc.).
   - If the Agent realizes a requested logic change might incidentally affect the layout, it must STOP and ask for permission before proceeding.

3. **Phase 3: Post-Execution Verification**:
   - After completing the task, the Agent MUST provide a "Non-Modification Certificate": "I certify that no unrequested styles, layouts, or existing features were altered during this process."
   - The Agent must provide a diff that clearly shows only the requested logic/feature was changed.

# Systemic Enforcement Measures (Hard Constraints)

To ensure absolute compliance and prevent unauthorized creative interference, the Agent must adhere to the following technical constraints:

1. **Mandatory Task Branching (Isolation)**:
   - For every task, the Agent MUST create a new Git branch (e.g., `task/feature-name`). 
   - Working on `main` or stable branches is strictly prohibited.
   - If a violation occurs, the user can immediately discard the branch to restore the system to its original state.

2. **Hard-Locking Style & Layout Files**:
   - Unless "Design," "Style," or "Layout" is explicitly requested, the Agent is FORBIDDEN from reading or editing style-related files (e.g., `.css`, `.scss`, `theme.js`, `tailwind.config.js`).
   - The Agent must treat these files as "Off-Limits" to physically prevent any unintended design shifts.

3. **Quantitative Modification Audit**:
   - Before execution, the Agent must estimate the number of files and lines to be changed.
   - Post-execution, the Agent must run `git diff --stat` to verify that no unauthorized files were touched. Any discrepancy must be reported as a critical failure.

# 엑셀 보고서 양식(ExcelJS) 작업 규칙

- **스타일은 반드시 `cell.style = {...}` 하나로 한 번에 대입한다.** `cell.font = {...}`,
  `cell.border = {...}`처럼 속성을 따로따로 대입하면, 행이 많을 때 ExcelJS가 내부 스타일
  테이블을 서로 다른 행끼리 뒤섞어버리는 버그가 있다(실제로 겪음 — 셀 정렬/테두리가
  엉뚱한 행에 적용됨).
- **`numFmt`는 `cell.value =` 대입 전에 미리 읽어서 보존한다.** 값을 먼저 쓰면 그 다음에
  읽는 numFmt가 초기화된 값으로 나올 수 있다.
- **병합 셀은 반복문으로 스타일을 주지 않는다.** 병합 범위의 각 열에 대해 `getCell(row, col)`을
  반복 호출하면 전부 같은 anchor 셀 객체를 반환해 마지막 반복만 남고 앞선 것들이 사라진다.
  병합 셀은 anchor 셀 하나에 필요한 변(top/bottom/left/right)을 한 번에 지정한다.
- **표 테두리 3단계 컨벤션** (연번/그룹 단위로 묶이는 보고서 공통 규칙):
  - 표 전체 외곽(헤더 ~ 데이터 마지막 행, 좌우 포함): `medium`(굵은 실선)
  - 연번(그룹)이 바뀌는 위/아래 경계: `double`(이중선)
  - 같은 연번 내부(분할행 사이): `dotted`(점선)
- **행 늘리기/줄이기**: `ws.duplicateRow(마지막템플릿행, 추가행수, true)`로 늘리고,
  줄일 때는 `(ws as any)._rows.length = 유지할행수`로 직접 자른다 —
  `spliceRows`는 삭제 범위가 시트 끝까지 이어지면 아무것도 못 지우는 버그가 있다.
- **분할결제(카드+현금 등) 행 전개 시**: 번호·날짜·이름·구분 등 식별 정보는 합계행뿐
  아니라 회차별 상세행에도 전부 반복해서 채운다(빈칸으로 남기지 않는다) — 매출일일보고
  방식을 기준으로 통일한다.
- **템플릿 파일이 수정되면 행 수/시작행 상수(`DATA_START_ROW`, `TEMPLATE_DATA_ROWS`)를
  반드시 다시 확인한다** — 열 너비 변경은 코드에 영향 없지만 행 수 변경은 리사이즈 로직이
  깨진다.
