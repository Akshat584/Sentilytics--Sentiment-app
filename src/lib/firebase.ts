import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Validate connection quietly
async function testConnection() {
  try {
    // Use a path that is likely to be public or at least not throw a blocking error
    await getDocFromServer(doc(db, '_health', 'check'));
  } catch (error) {
    // Only log if it's a configuration error (offline)
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration. The client is offline.');
    }
  }
}

// We don't call it at the top level to avoid PERMISSION_DENIED before auth
// testConnection();
