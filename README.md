# technical-writing-review

[technical-writing 가이드](https://technical-writing.dev)의 문장/문서유형/정보구조 원칙을 기준으로, PR에서 변경된 문서(`.md`, `.mdx`)를 자동으로 리뷰하는 GitHub Actions 봇이에요.

## 동작 방식

1. PR이 열리거나(opened) 갱신되면(synchronize), `.md`/`.mdx` 파일 변경이 있을 때만 워크플로우가 실행돼요.
2. `references/tw-principles/` 아래 세 원칙 파일을 Claude가 읽고, 이번 PR에서 바뀐 라인만 원칙에 대조해요.
3. 원칙을 위반한 부분에 `[필수]`(반드시 고쳐야 함) 또는 `[제안]`(권장 개선) 태그를 붙여 인라인 리뷰 코멘트를 남기고, 가능하면 GitHub suggestion으로 수정안을 함께 제시해요.

## 설치

1. 이 저장소를 GitHub에 push하세요.
2. 저장소 **Settings → Secrets and variables → Actions**에서 `ANTHROPIC_API_KEY` 시크릿을 등록하세요.
3. (선택) Claude가 PR에 코멘트를 남기려면 GitHub App 권한이 필요해요. 터미널에서 `claude`를 실행한 뒤 `/install-github-app`을 입력하면 앱 설치와 워크플로우 브랜치 생성까지 자동으로 안내해줘요. 이미 이 워크플로우 파일이 있으니, 앱 설치만 따라가도 돼요.
4. 이후 문서를 변경하는 PR을 열면 자동으로 리뷰가 달려요.

## 리뷰 기준 수정하기

`references/tw-principles/` 아래 세 파일(`sentence.md`, `document-types.md`, `architecture.md`)을 직접 편집하면 리뷰 기준이 바뀌어요. 이 파일들은 [technical-writing 가이드](https://technical-writing.dev)의 원칙을 그대로 옮긴 것이라, 팀 상황에 맞게 체크리스트를 추가/삭제해서 커스터마이징할 수 있어요.

## 제약 사항

- **fork에서 온 PR은 리뷰되지 않아요.** `pull_request_target` 대신 `pull_request` 이벤트를 사용하기 때문이에요. `pull_request_target`을 쓰면 fork PR이 base 브랜치 컨텍스트(시크릿 포함)에서 실행되어 `ANTHROPIC_API_KEY`가 탈취될 위험이 있어요(이른바 "pwn request"). 외부 기여자의 PR도 리뷰하려면, 메인테이너가 diff를 확인한 뒤 수동으로 트리거하는 별도 워크플로우를 추가하세요.
- 문서(`.md`/`.mdx`) 변경에만 반응해요. 코드 리뷰가 필요하면 별도 워크플로우를 구성하세요.
