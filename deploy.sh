#!/bin/bash
# Vercel 배포 스크립트
#
# 두 가지 문제를 우회한다.
# 1. Vercel CLI는 git 리모트를 발견하면 GitHub 저장소 연결을 시도하는데,
#    이 Vercel 계정은 great-opportunity 저장소 접근 권한이 없어서 연결이
#    실패하고 그 뒤 빌드가 무한 대기 상태로 멈춘다. 배포 동안만 .git을 숨긴다.
# 2. 배포가 끝나도 rewind-eng-mvp.vercel.app 주소가 이전 배포를 계속 가리키는
#    일이 있어서, 배포 후 주소를 직접 새 배포로 옮겨준다.

set -e
cd "$(dirname "$0")"

ALIAS_DOMAIN="rewind-eng-mvp.vercel.app"

restore_git() {
  if [ -d .git-deploy-tmp ]; then
    mv .git-deploy-tmp .git
  fi
}
trap restore_git EXIT

mv .git .git-deploy-tmp
OUTPUT=$(vercel --prod --yes "$@")
restore_git

echo "$OUTPUT"

DEPLOY_URL=$(echo "$OUTPUT" | grep -oE 'https://rewind-eng-[a-z0-9]+-jeeyoung-jeons-projects\.vercel\.app' | head -1)

if [ -z "$DEPLOY_URL" ]; then
  echo "배포 URL을 찾지 못해 주소 연결을 건너뜁니다." >&2
  exit 1
fi

vercel alias set "$DEPLOY_URL" "$ALIAS_DOMAIN"
echo "https://$ALIAS_DOMAIN → $DEPLOY_URL"
