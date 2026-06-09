// --- Firebase 라이브러리 임포트 ---
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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
  db = getFirestore(app);
} catch (error) {
  console.error("Firebase 초기화 에러:", error);
}

const appId = (typeof window !== 'undefined' && typeof window.__app_id !== 'undefined') ? window.__app_id : 'tech-team-pms-app';

export { auth, db, appId };
