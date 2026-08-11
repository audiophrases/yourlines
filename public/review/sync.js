/* ============================================================
   Cloud sync — Google sign-in and one Firestore doc per user.

   index.html owns the review archive (window.CmrCloud); this file signs
   you in, hands the cloud copy over for merging, and sends up whatever
   the app wants written. It shares the Sparring Coach's project and the
   same users/{uid} tree as the other suite apps, in a document of its
   own — they are the same person on the same devices, and one sign-in
   for all of them is one less thing to do.

   The merge rules live in index.html, and they are what makes this safe
   to run on two devices at once: a write only ever adds, so no analysis
   is lost to a race. Offline, the SDK queues the write itself.
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, doc, setDoc, onSnapshot }
  from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

/* Public identifiers, not secrets: they say which project to talk to, and the
   Firestore rules are what keep each user inside their own document. */
const firebaseConfig = {
  apiKey: "AIzaSyABDOJOFRzDDUHSqHEaUMrwPKEnhTeP7QI",
  authDomain: "sparringcoachchessapp.firebaseapp.com",
  projectId: "sparringcoachchessapp",
  storageBucket: "sparringcoachchessapp.firebasestorage.app",
  messagingSenderId: "324354749466",
  appId: "1:324354749466:web:01f87e6620862b32cf4da3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { localCache: persistentLocalCache() });

const $ = id => document.getElementById(id);
/* if the app's own script never ran there is nothing to sync, but the page
   should still not throw on the way past */
const cloud = window.CmrCloud || { merge() {}, setPusher() {} };

let ref = null, unsub = null;

/* merge, so this write leaves every field it does not mention alone — which
   is how a second device's saved reviews survive it */
function push(payload) {
  if (!ref) return;
  setDoc(ref, { review: payload }, { merge: true })
    .catch(e => console.warn("[sync] write refused: " + e.message));
}

function paint(user) {
  const who = $("who"), btn = $("signin");
  if (who) {
    who.classList.toggle("hidden", !user);
    who.textContent = user ? (user.email || "signed in") : "";
  }
  if (btn) {
    btn.textContent = user ? "Sign out" : "Sign in";
    btn.disabled = false;
  }
}

onAuthStateChanged(auth, user => {
  if (unsub) { unsub(); unsub = null; }
  paint(user);
  if (!user) { ref = null; cloud.setPusher(null); return; }
  /* its own document, so every app gets its own 1 MiB rather than sharing
     one, and a write here does not wake the other apps' listeners */
  ref = doc(db, "users", user.uid, "apps", "review");
  cloud.setPusher(push);
  unsub = onSnapshot(ref,
    snap => { const d = snap.data(); if (d && d.review) cloud.merge(d.review); },
    e => console.warn("[sync] read refused: " + e.message));
});

$("signin").onclick = () => {
  if (auth.currentUser) {
    if (confirm("Sign out? Your saved reviews stay in the cloud and come back when you sign in again."))
      signOut(auth);
    return;
  }
  signInWithPopup(auth, new GoogleAuthProvider()).catch(e => {
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request")
      alert("Sign-in failed: " + e.message);
  });
};
$("signin").disabled = false;
