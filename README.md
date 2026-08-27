# 클린 영상 다운로더 v2.5

Windows와 macOS에서 권한 있는 온라인 영상을 저장하고 Premiere Pro 호환 MP4로 정리하는 데스크톱 앱입니다.

## 주요 기능

- YouTube, Vimeo, Instagram, TikTok, TVCF 개별 영상 링크
- TVCF 앱 내 로그인 세션과 계정 권한 범위의 1080p/4K 스트림 확인
- H.264 / AAC 48kHz / `yuv420p` / Fast Start MP4 변환
- 여러 링크 중복 제거 및 순차 처리
- 제공되는 경우 SRT 자막과 JPG 썸네일 저장
- Chrome 우클릭 메뉴에서 앱 없이 직접 미디어 저장, 영상 프레임 복사·PNG 저장
- Premiere Pro 2022+ 올인원 CEP 패널에서 앱 없이 링크 다운로드, MP4 변환, 프로젝트 임포트와 활성 타임라인 삽입
- Premiere 클립보드 이미지·파일·링크 붙여넣기와 현재 프레임 PNG/JPG 저장·복사
- GitHub Releases 새 버전 확인

DRM, 유료 구독, 다운로드 한도, 계정 접근 제어를 우회하지 않습니다. 직접 소유했거나 저장 권한을 받은 영상에만 사용하세요.

## 개발 실행

Node.js 22 이상에서:

```bash
npm ci
npm run prepare:tools
npm start
```

## 테스트

```bash
npm test
```

## 패키징

```bash
npm run build:win
npm run build:mac
npm run package:extension
npm run package:cep
```

macOS 빌드는 해당 Mac 아키텍처에서 실행하는 것을 권장합니다. `electron-builder` 26.15.3 이상과 패키징 훅을 함께 사용해 macOS 26에서 앱이 시작 즉시 종료되는 Helper 경로 문제를 피합니다. Apple Silicon 빌드에는 ARM64 `ffprobe`가 포함됩니다.

공개 배포에서 Gatekeeper 차단 경고를 없애려면 Apple Developer ID Application 서명과 Apple 공증이 필요합니다. Developer ID가 없는 로컬/ad-hoc 빌드는 기능 검증용으로만 사용하세요.

Chrome 웹 스토어 공개 등록은 개발자 계정 등록과 심사가 별도로 필요합니다. `extension/` 폴더는 개발자 모드에서 바로 불러올 수 있습니다.

Premiere Pro 2022 이상에서는 `premiere-cep/`의 올인원 패널을 사용할 수 있습니다. 이 패널은 첫 작업 때 운영체제별 공개 `yt-dlp`·`ffmpeg` 엔진을 GitHub Releases에서 자동 준비하므로 클린 영상 다운로더 데스크톱 앱이 필요하지 않습니다. Premiere Pro 25.6 이상의 기존 UXP 패널은 `premiere-plugin/`에 보존되어 있습니다.
