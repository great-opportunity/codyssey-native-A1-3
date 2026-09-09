#!/bin/bash
# Vercel 배포 스크립트
#
# Vercel CLI는 git 리모트를 발견하면 GitHub 저장소 연결을 시도하는데,
# 이 Vercel 계정(hoho0506)은 great-opportunity 저장소 접근 권한이 없어서
# 연결이 실패하고 그 뒤 빌드가 무한 대기 상태로 멈춘다.
# 배포하는 동안만 .git을 숨겨서 연결 시도 자체를 막는다.

set -e
cd "$(dirname "$0")"

restore_git() {
  if [ -d .git-deploy-tmp ]; then
    mv .git-deploy-tmp .git
  fi
}
trap restore_git EXIT

mv .git .git-deploy-tmp
vercel --prod --yes
