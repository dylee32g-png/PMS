// --- Firebase 라이브러리 임포트 ---
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, CACHE_SIZE_UNLIMITED } from 'firebase/firestore';

const localFirebaseConfig = {
  apiKey: "AIzaSyBlD6lIyfXckxEW6Fb6azc-xDsXdivC_Rw",
  authDomain: "techteampms.firebaseapp.com",
  projectId: "techteampms",
  storageBucket: "techteampms.firebasestorage.app",
  messagingSenderId: "427625152143",
  appId: "1:427625152143:web:bda10feccaadca391c7afa"
};

// 환경 감지
const isCanvasEnv = typeof window !== 'undefined' && typeof window.__firebase_config !== 'undefined';
const firebaseConfig = isCanvasEnv ? JSON.parse(window.__firebase_config) : localFirebaseConfig;

// Firebase 초기화
let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // 영구 로컬 캐시 (2026-08-11): 마지막 데이터를 브라우저(IndexedDB)에 저장해 두고,
  //   화면 진입 시 캐시로 즉시 그린 뒤 서버 최신값이 도착하면 자동 갱신 — 진입 속도 개선.
  //   multipleTabManager = 탭 여러 개 동시 사용 안전.
  try {
    // cacheSizeBytes 무제한 (2026-08-24): 기본 한도 40MB — 전연도 적재로 3팀 데이터가 커지자
    //   캐시가 LRU로 밀려나 재진입 때도 서버 재다운로드(팀 전환 느림 재발)되던 것을 방지.
    // ★ 영구 캐시 스위치 (2026-08-26 속도 실험): 저장 1건마다 IndexedDB 왕복 10여 회(각 ~100ms 멈춤)가 실측돼
    //   메모리 캐시(구독 중엔 동일·새로고침 때만 재다운로드)와 비교 측정. true=영구(IndexedDB) / false=메모리.
    const USE_PERSISTENT_CACHE = true;   // 실험 결과(8/26): 메모리 캐시도 저장 후 처리량 비슷 + 새로고침마다 전량 재다운로드(읽기 할당량 소모) → 영구 유지
    db = USE_PERSISTENT_CACHE
      ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: CACHE_SIZE_UNLIMITED }) })
      : initializeFirestore(app, { localCache: memoryLocalCache() });
  } catch (e) {
    db = getFirestore(app);   // 캐시 초기화 실패(구형 브라우저 등) 시 기존 방식 그대로
  }
} catch (error) {
  console.error("Firebase 초기화 에러:", error);
}

const appId = (typeof window !== 'undefined' && typeof window.__app_id !== 'undefined') ? window.__app_id : 'tech-team-pms-app';

export { auth, db, appId };
