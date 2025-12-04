// js/auth.js
import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Helper to get role from users collection
export async function getUserRole(uid) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data().role || null;
}

// LOGIN PAGE
export function attachLoginHandler() {
  const form = document.getElementById('loginForm');
  const emailEl = document.getElementById('loginEmail');
  const passEl = document.getElementById('loginPassword');
  const errorEl = document.getElementById('loginError');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    try {
      const cred = await signInWithEmailAndPassword(auth, emailEl.value, passEl.value);
      const role = await getUserRole(cred.user.uid);
      if (role === 'admin') {
        window.location.href = '/admin.html';
      } else if (role === 'player') {
        window.location.href = '/player.html';
      } else {
        errorEl.textContent = 'No role assigned. Contact admin.';
      }
    } catch (err) {
      errorEl.textContent = err.message.replace('Firebase:', '').trim();
    }
  });
}

// If already logged in, send to correct dashboard
export function autoRedirectIfLoggedIn() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    const role = await getUserRole(user.uid);
    if (role === 'admin') window.location.href = '/admin.html';
    else if (role === 'player') window.location.href = '/player.html';
  });
}

// Route guard: require admin/player
export function guardPage(expectedRole, onReady) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = '/index.html';
      return;
    }
    const role = await getUserRole(user.uid);
    if (role !== expectedRole) {
      window.location.href = '/index.html';
      return;
    }
    onReady(user, role);
  });
}

export function logout() {
  return signOut(auth);
}
