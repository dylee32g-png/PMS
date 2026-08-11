// --- Firebase 라이브러리 임포트 ---
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

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
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch (e) {
    db = getFirestore(app);   // 캐시 초기화 실패(구형 브라우저 등) 시 기존 방식 그대로
  }
} catch (error) {
  console.error("Firebase 초기화 에러:", error);
}

const appId = (typeof window !== 'undefined' && typeof window.__app_id !== 'undefined') ? window.__app_id : 'tech-team-pms-app';

export { auth, db, appId };
