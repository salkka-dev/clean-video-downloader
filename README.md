# 클린 영상 다운로더 v2.4

Windows와 macOS에서 권한 있는 온라인 영상을 저장하고 Premiere Pro 호환 MP4로 정리하는 데스크톱 앱입니다.

## 주요 기능

- YouTube, Vimeo, Instagram, TVCF 개별 영상 링크
- TVCF 앱 내 로그인 세션과 계정 권한 범위의 1080p/4K 스트림 확인
- H.264 / AAC 48kHz / `yuv420p` / Fast Start MP4 변환
- 여러 링크 중복 제거 및 순차 처리
- 제공되는 경우 SRT 자막과 JPG 썸네일 저장
- Chrome 우클릭 메뉴에서 직접 미디어 저장
- Premiere Pro UXP 패널에서 링크 다운로드, MP4 변환, 프로젝트 임포트와 활성 타임라인 삽입
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
```

macOS 빌드는 해당 Mac 아키텍처에서 실행하는 것을 권장합니다. 공개 배포용 무경고 실행은 Apple Developer ID 서명과 공증이 필요합니다. 현재 자동 빌드는 기존 v2.2의 완전 미서명 상태를 고쳐 ad-hoc 서명과 Electron 필수 entitlement를 적용하며, 최초 실행 시에는 macOS에서 사용자 승인이 필요할 수 있습니다.

Chrome 웹 스토어 공개 등록은 개발자 계정 등록과 심사가 별도로 필요합니다. `extension/` 폴더는 개발자 모드에서 바로 불러올 수 있습니다.

Premiere Pro 25.6 이상에서는 `premiere-plugin/`의 UXP 패널을 사용할 수 있습니다. 배포용 `CCX`는 Adobe UXP Developer Tool로 패키징하거나 `npm run package:premiere`로 동일한 ZIP 기반 번들을 만들 수 있습니다. 플러그인은 클린 영상 다운로더 데스크톱 앱 2.4.0 이상과 함께 동작합니다.
