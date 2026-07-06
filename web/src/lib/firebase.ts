// Firebase 초기화 (Authentication 전용 — Hosting/기타는 별도 설정)
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyA-gaBIdtGqbdbb0R3ceaFkRqa11LmDzPc',
  authDomain: 'lassettlemanager.firebaseapp.com',
  projectId: 'lassettlemanager',
  storageBucket: 'lassettlemanager.firebasestorage.app',
  messagingSenderId: '325630982266',
  appId: '1:325630982266:web:118e59c1dd3a6db349a3c3',
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
