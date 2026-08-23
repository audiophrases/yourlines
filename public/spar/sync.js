/* ============================================================
   Cloud sync — Google sign-in and one Firestore document per app.
   app.js owns the record (window.SparStats); this file signs you
   in, mirrors the cloud copy back into it, and turns every new
   tally into a merge of increments — which is what lets two
   devices finish games at the same time without losing either.
   Offline, the SDK queues the writes itself. Signed out, app.js
   keeps the tallies in this browser and hands them over here,
   once, at the moment you sign in.

   The record lives at users/{uid}/apps/sparring, which is where
   the rest of the suite keeps its own — one document each, so
   every app gets its own 1 MiB and its own share of the index
   rather than all of them crowding the one document, and so a
   game finished here stops waking the other apps' listeners for
   a change that is none of their business. What was written to
   the shared document before is lifted across once; see below,
   because for this app that is not the simple copy it is for the
   others.
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, doc, setDoc, onSnapshot, increment, runTransaction }
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
let ref = null, unsub = null;

function push(delta){
  const patch = {};
  for (const k in delta){
    const v = delta[k], cell = {};
    if (v.w) cell.w = increment(v.w);
    if (v.l) cell.l = increment(v.l);
    if (v.d) cell.d = increment(v.d);
    patch[k] = cell;
  }
  /* a rejected write (rules, quota) goes back into the browser copy rather
     than vanishing; offline is not a rejection — the SDK queues those */
  setDoc(ref, { stats: patch }, { merge: true }).catch(e => {
    console.warn("[sync] write refused: " + e.message);
    window.SparStats.absorb(delta);
  });
}

/* Lifting the old record across, exactly once and never twice.

   The sibling apps can hand their old field to the same merge the live
   listener uses and let it happen as often as it likes: their merges settle
   rather than accumulate — the newer practice wins, the lifetime tallies only
   climb to a number that is already known. This record does not work that
   way. Every write here is an increment, so a copy that ran a second time
   would not be a wasted write, it would be a game counted twice, silently and
   for good, in a record whose whole purpose is to tell you which lines you
   lose to.

   So the copy is guarded by a mark, and the mark is written in the same
   breath as the copy. A transaction is what makes "in the same breath" true:
   two devices signing in for the first time at the same moment would
   otherwise both read an unmarked document and both add the old totals. The
   transaction gives one of them the write and makes the other read again,
   where it finds the mark and does nothing.

   The old field is left exactly where it is. Nothing is deleted, so the
   shared document remains a complete record of everything played before the
   move — which is what makes this reversible if it ever needs to be. */
const cell = c => ({w: (c && c.w) || 0, l: (c && c.l) || 0, d: (c && c.d) || 0});
async function liftLegacy(uid){
  const from = doc(db, "users", uid);
  const to   = doc(db, "users", uid, "apps", "sparring");
  try {
    await runTransaction(db, async tx => {
      /* every read before any write, which is the rule transactions keep */
      const now = await tx.get(to);
      if (now.exists() && now.data().lifted) return;         // already carried over
      const old = await tx.get(from);
      const was = (old.exists() && old.data().stats) || null;
      const has = (now.exists() && now.data().stats) || {};
      const merged = {};
      for (const k in has) merged[k] = cell(has[k]);
      for (const k in was || {}){
        const a = merged[k] || {w:0, l:0, d:0}, b = cell(was[k]);
        merged[k] = {w: a.w + b.w, l: a.l + b.l, d: a.d + b.d};
      }
      /* the mark goes on even when there was nothing to carry, so a user who
         never used the shared document is not asked this question again */
      tx.set(to, {stats: merged, lifted: true}, {merge: true});
      if (was) console.info("[sync] lifted " + Object.keys(was).length
        + " recorded lines out of the shared document");
    });
  } catch(e){
    /* Offline, or refused. The mark is unwritten either way, so the next
       sign-in tries again — and anything played meanwhile is already in the
       new document, where the lift adds to it rather than replacing it. */
    console.warn("[sync] carry-over deferred: " + e.message);
  }
}

function paint(user){
  $("who").hidden = !user;
  $("who").textContent = user ? user.email : "";
  $("signin").textContent = user ? "Sign out" : "Sign in — sync";
}

onAuthStateChanged(auth, async user => {
  if (unsub){ unsub(); unsub = null; }
  paint(user);
  if (!user){
    ref = null;
    window.SparStats.setPusher(null);
    window.SparStats.setCloud(null);
    return;
  }
  ref = doc(db, "users", user.uid, "apps", "sparring");
  /* Before anything is pushed or listened to. The lift reads what is in the
     new document and writes the sum back, so a write landing in the middle of
     it would be read and then written over — the transaction would retry, but
     only if it saw the change, and the tallies below are the one write we can
     be sure is coming. Doing it first removes the question. */
  await liftLegacy(user.uid);
  /* tallies made signed out become increments now; taken rather than copied,
     so a game can never be counted twice */
  const pending = window.SparStats.takeLocal();
  if (Object.keys(pending).length) push(pending);
  window.SparStats.setPusher(push);
  unsub = onSnapshot(ref,
    snap => { const d = snap.data(); window.SparStats.setCloud((d && d.stats) || {}); },
    e => console.warn("[sync] read refused: " + e.message));
});

$("signin").onclick = () => {
  if (auth.currentUser){
    if (confirm("Sign out? Your record stays in the cloud and comes back when you sign in again."))
      signOut(auth);
    return;
  }
  signInWithPopup(auth, new GoogleAuthProvider()).catch(e => {
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request")
      alert("Sign-in failed: " + e.message);
  });
};
