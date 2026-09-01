// Firestore-backed presence/winner sync, replacing the Co-Doing API (which
// requires Live Sharing SDK EAP enrollment - see README.md). One document
// per Meet call, keyed by its meetingCode, with a participants subcollection
// so each side panel can update only its own entry without racing others.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  getFirestore, doc, setDoc, deleteDoc, onSnapshot, collection,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { FIREBASE_CONFIG } from './shared.js';

const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);

function meetingDocRef(meetingCode) {
  return doc(db, 'meetings', meetingCode);
}

function participantDocRef(meetingCode, clientId) {
  return doc(db, 'meetings', meetingCode, 'participants', clientId);
}

export function announcePresence(meetingCode, clientId, name) {
  return setDoc(participantDocRef(meetingCode, clientId), {
    name,
    lastSeen: Date.now(),
  });
}

export function leavePresence(meetingCode, clientId) {
  return deleteDoc(participantDocRef(meetingCode, clientId)).catch(() => {});
}

// onChange receives { [clientId]: { name, lastSeen } } - the full live set,
// no manual merging needed (unlike Co-Doing's broadcast-only channel).
export function subscribeParticipants(meetingCode, onChange) {
  return onSnapshot(collection(db, 'meetings', meetingCode, 'participants'), (snapshot) => {
    const participants = {};
    snapshot.forEach((docSnap) => {
      participants[docSnap.id] = docSnap.data();
    });
    onChange(participants);
  });
}

// onChange receives the winner object ({ name, ts }) or null.
export function subscribeWinner(meetingCode, onChange) {
  return onSnapshot(meetingDocRef(meetingCode), (snapshot) => {
    const data = snapshot.data();
    onChange((data && data.winner) || null);
  });
}

export function setWinner(meetingCode, winner) {
  return setDoc(meetingDocRef(meetingCode), { winner }, { merge: true });
}
