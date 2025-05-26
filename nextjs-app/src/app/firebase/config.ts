// Firebase configuration
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyDvP8nxz-mkmJaihWXU9je3mTfit93fTF4",
  authDomain: "servate-b45e4.firebaseapp.com",
  databaseURL: "https://servate-b45e4-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "servate-b45e4",
  storageBucket: "servate-b45e4.firebasestorage.app",
  messagingSenderId: "288940483230",
  appId: "1:288940483230:web:79157da34827124083518f"
};

// Initialize Firebase only if no apps are initialized
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const database = getDatabase(app);

export { app, auth, database }; 