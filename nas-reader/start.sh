#!/bin/sh
# PMS 진척자료 클라우드 자동 반영기 — 컨테이너 시작 스크립트
# (시놀로지 Docker 화면에서 컨테이너를 직접 만들 때 사용)
#
# 컨테이너 "명령" 칸에 이것만 넣으면 됩니다:   sh /app/start.sh
#
# 하는 일: 필요한 라이브러리를 /app/.pip 에 설치하고 main.py 를 실행
#          (설치본이 남으므로 두 번째 실행부터는 빨라집니다)

set -e
cd /app

echo "[start] $(date '+%Y-%m-%d %H:%M:%S') 컨테이너 시작"

if [ ! -f /app/requirements.txt ]; then
  echo "[start] ★ /app/requirements.txt 가 없습니다. 볼륨 연결(/docker/pms-reader → /app)을 확인하세요."
  exit 1
fi
if [ ! -f /app/main.py ]; then
  echo "[start] ★ /app/main.py 가 없습니다. 볼륨 연결을 확인하세요."
  exit 1
fi
if [ ! -f /app/config.json ]; then
  echo "[start] ★ /app/config.json 이 없습니다."
  exit 1
fi
if [ ! -f /app/firebase-key.json ]; then
  echo "[start] ★ /app/firebase-key.json 이 없습니다. Firebase 키 파일 이름을 확인하세요."
  exit 1
fi

echo "[start] 라이브러리 확인·설치 중... (처음 한 번만 오래 걸립니다)"
pip install --no-cache-dir --target=/app/.pip -q -r /app/requirements.txt

echo "[start] 프로그램 실행"
export PYTHONPATH=/app/.pip
exec python /app/main.py
