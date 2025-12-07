// js/auth.js

// =====================
// FIREBASE IMPORTS
// =====================
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { auth, db } from "./firebase-config.js";

import {
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


// =====================
// ENSURE USER PROFILE
// =====================
async function ensureUserProfile(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    await setDoc(userRef, {
      name: user.displayName || user.email || "",
      role: "player",        // default for Google/Apple login
      createdAt: Date.now()
    });
  }
}


// =====================
// GET USER ROLE
// =====================
export async function getUserRole(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data().role || null;
}


// =====================
// EMAIL/PASSWORD LOGIN
// =====================
export function attachLoginHandler() {
  const form = document.getElementById("loginForm");
  const emailEl = document.getElementById("loginEmail");
  const passEl = document.getElementById("loginPassword");
  const errorEl = document.getElementById("loginError");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";

    try {
      const cred = await signInWithEmailAndPassword(auth, emailEl.value, passEl.value);

      await ensureUserProfile(cred.user);

      const role = await getUserRole(cred.user.uid);

      if (role === "admin") {
        window.location.href = "/admin.html";
      } else if (role === "player") {
        window.location.href = "/player.html";
      } else {
        errorEl.textContent = "No role assigned. Contact admin.";
      }

    } catch (err) {
      errorEl.textContent = err.message.replace("Firebase:", "").trim();
    }
  });
}


// =====================
// GOOGLE LOGIN (PLAYER)
// =====================
export async function loginPlayerWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    await ensureUserProfile(user);

    window.location.href = "/player.html";

  } catch (err) {
    console.error("Google login failed:", err);
    alert("Google login failed: " + (err.message || err));
  }
}


// =====================
// APPLE LOGIN (PLAYER)
// =====================
export async function loginPlayerWithApple() {
  try {
    const provider = new OAuthProvider("apple.com");
    provider.addScope("email");
    provider.addScope("name");

    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    await ensureUserProfile(user);

    window.location.href = "/player.html";

  } catch (err) {
    console.error("Apple login failed:", err);
    alert("Apple login failed: " + (err.message || err));
  }
}


// =====================
// AUTO REDIRECT (IF LOGGED IN)
// =====================
export function autoRedirectIfLoggedIn() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    await ensureUserProfile(user);

    const role = await getUserRole(user.uid);

    if (role === "admin") window.location.href = "/admin.html";
    else window.location.href = "/player.html";
  });
}


// =====================
// PAGE GUARD (ADMIN/PLAYER PROTECTION)
// =====================
export function guardPage(expectedRole, onReady) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "/index.html";
      return;
    }

    await ensureUserProfile(user);

    const role = await getUserRole(user.uid);

    if (role !== expectedRole) {
      window.location.href = "/index.html";
      return;
    }

    onReady(user, role);
  });
}


// =====================
// LOGOUT
// =====================
export function logout() {
  return signOut(auth);
}


// =====================
// AUTO-ATTACH LOGIN HANDLERS
// =====================
if (document.getElementById("loginForm")) {
  attachLoginHandler();
  autoRedirectIfLoggedIn();
}

document.getElementById("playerGoogleLogin")?.addEventListener("click", (e) => {
  e.preventDefault();
  loginPlayerWithGoogle();
});

document.getElementById("playerAppleLogin")?.addEventListener("click", (e) => {
  e.preventDefault();
  loginPlayerWithApple();
});
