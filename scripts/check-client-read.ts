import { initializeApp } from 'firebase/app'
import { getDoc, doc, getFirestore } from 'firebase/firestore'

const app = initializeApp({
  apiKey: 'AIzaSyBm_j3e1DWVh344sIaMhwNjzh4eqj50nak',
  authDomain: 'ultracycling-8bd56.firebaseapp.com',
  projectId: 'ultracycling-8bd56',
  storageBucket: 'ultracycling-8bd56.firebasestorage.app',
  messagingSenderId: '700759286688',
  appId: '1:700759286688:web:6aa080fb5b0341ab9a7ac5',
})

const db = getFirestore(app)

try {
  const snap = await getDoc(doc(db, 'tiles', 'u0nzu'))
  console.log('client read OK:', snap.exists(), snap.data()?.poiCount)
} catch (err) {
  console.error('client read FAILED:', err)
}
