# NoTouch.py Study Handout

TouchDesigner를 매개로 이미지, 시스템, 감각, 도구에 대해 생각하는 12개의 글을 정적 핸드아웃으로 빌드하는 공간입니다.

## 글 작성 규칙

`posts/` 폴더에 아래 형식으로 `.md` 파일을 추가합니다. 파일명 제목의 `_`는 페이지에서 공백으로 표시됩니다.

```text
posts/yyyy-MM-dd-${제목}.md
```

예를 들어:

```text
posts/2026-06-18-반복과_패턴.md
```

이 파일은 빌드 후 제목이 `반복과 패턴`으로 표시되고, 아래 경로에서 접근할 수 있습니다.

```text
public/posts/2026-06-18-반복과_패턴/index.html
```

## Frontmatter

목록 카드와 상세 페이지의 질문 박스에 사용할 정보를 글 상단에 적습니다.

```md
---
summary: TouchDesigner에서 반복은 단순한 복사가 아니라 감각을 조율하는 방식이다.
question: 같은 움직임이 반복될 때, 우리는 무엇을 다르게 보게 될까?
---

# 반복과 패턴

본문...
```

`summary`는 첫 화면 카드의 1문장 요약으로 쓰이고, `question`은 카드와 상세 페이지의 “생각해볼 질문”으로 쓰입니다.

## 빌드

```bash
npm run build
```

빌드 결과는 `public/`에 생성됩니다.

## 로컬 확인

```bash
npm run serve
```

브라우저에서 `http://localhost:4173`으로 확인합니다.
