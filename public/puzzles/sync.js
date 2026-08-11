/* ============================================================
   Cloud sync — Google sign-in and one Firestore doc per user.

   index.html owns the puzzles (window.YcpCloud); this file signs you in,
   hands the cloud copy over for merging, and takes whatever the app wants
   written. It shares the Sparring Coach's project and the same users/{uid}
   document, under a `puzzles` field of its own — the two apps are the same
   person on the same devices, and one sign-in for both is one less thing
   to do.

   The merge rules live in index.html, and they are what makes this safe to
   run on two devices at once: a write only ever adds. Offline, the SDK
   queues it.
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, doc, getDoc, setDoc, onSnapshot }
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
const cloud = window.YcpCloud || { merge() {}, setPusher() {} };

let ref = null, unsub = null;

/* merge, so this write leaves every field it does not mention alone — which
   is how a second device's solves survive it */
function push(payload) {
  if (!ref) return;
  setDoc(ref, { puzzles: payload }, { merge: true })
    .catch(e => console.warn("[sync] write refused: " + e.message));
}

/* This app used to write its `puzzles` field into the shared users/{uid}
   document, alongside the other apps. It has its own document now, so that
   every app gets its own 1 MiB rather than sharing one — a ceiling this
   app, which keeps a record per game scanned, would have reached first,
   and reached silently: an oversized write is refused, and a refusal is
   only a console warning.

   Nothing is copied by hand. The old field is read once and handed to the
   very same merge the live listener uses, and the app's own next push
   carries it into the new home. The old document is left exactly as it is,
   which makes this reversible: it is still a complete backup. */
async function liftLegacy(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const data = snap.exists() ? snap.data() : null;
    if (data && data.puzzles) cloud.merge(data.puzzles);
  } catch (e) {
    console.warn("[sync] legacy read skipped: " + e.message);
  }
}

function paint(user) {
  const who = $("who"), btn = $("signin");
  who.classList.toggle("hide", !user);
  who.textContent = user ? (user.email || "signed in") : "";
  btn.textContent = user ? "Sign out" : "Sign in — sync";
  btn.disabled = false;
}

onAuthStateChanged(auth, async user => {
  if (unsub) { unsub(); unsub = null; }
  paint(user);
  if (!user) { ref = null; cloud.setPusher(null); return; }
  ref = doc(db, "users", user.uid, "apps", "puzzles");
  /* before the pusher, so the one write that signing in triggers already
     carries anything lifted out of the old shared document */
  await liftLegacy(user.uid);
  cloud.setPusher(push);
  unsub = onSnapshot(ref,
    snap => { const d = snap.data(); if (d && d.puzzles) cloud.merge(d.puzzles); },
    e => console.warn("[sync] read refused: " + e.message));
});

$("signin").onclick = () => {
  if (auth.currentUser) {
    if (confirm("Sign out? Your puzzles stay in the cloud and come back when you sign in again."))
      signOut(auth);
    return;
  }
  signInWithPopup(auth, new GoogleAuthProvider()).catch(e => {
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request")
      alert("Sign-in failed: " + e.message);
  });
};
$("signin").disabled = false;
