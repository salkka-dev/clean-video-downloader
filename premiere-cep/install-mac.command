#!/bin/bash
set -e
SOURCE="$(cd "$(dirname "$0")" && pwd)"
TARGET_ROOT="$HOME/Library/Application Support/Adobe/CEP/extensions"
TARGET="$TARGET_ROOT/kr.cleanvideostudio.cep"
mkdir -p "$TARGET_ROOT"
rm -rf "$TARGET"
cp -R "$SOURCE" "$TARGET"
rm -f "$TARGET/install-windows.ps1" "$TARGET/install-windows.bat" "$TARGET/install-mac.command"
for VERSION in 8 9 10 11 12; do
  defaults write "com.adobe.CSXS.$VERSION" PlayerDebugMode 1
done
printf '\n클린 비디오 스튜디오 설치 완료\n'
printf 'Premiere를 완전히 종료했다가 다시 열고, 창 > 확장 기능(레거시) > 클린 비디오 스튜디오를 선택하세요.\n'
read -r -p 'Enter를 누르면 닫힙니다.' _
