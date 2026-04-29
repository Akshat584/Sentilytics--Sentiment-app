const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

// 1. Imports
content = content.replace(
  /import \{ initializeApp \} from 'firebase\/app';[\s\S]*?\} from 'firebase\/firestore';/,
  `import * as admin from 'firebase-admin';`
);

// 2. Auth state
content = content.replace(
  /let db: any;\nlet auth: any;\nlet isAuthReady = false;/,
  `let db: admin.firestore.Firestore;\nlet isAuthReady = true;`
);

// 3. initFirebase function
content = content.replace(
  /async function initFirebase\(\) \{[\s\S]*?\}\n\n\/\/ Initialize Redis with resilience/,
  `const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');

async function initFirebase() {
  if (admin.apps.length === 0) {
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      logger.info('Firebase Admin SDK initialized with service account.');
    } else if (fs.existsSync(configPath)) {
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      admin.initializeApp({
        projectId: firebaseConfig.projectId
      });
      logger.info('Firebase Admin SDK initialized with project ID.');
    } else {
      logger.warn('No firebase config found.');
      return;
    }
  }

  db = admin.firestore();

  try {
    db.collection('companies').onSnapshot(
      (snapshot) => {
        currentCompanies = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const data = JSON.stringify(currentCompanies);

        companySseClients.forEach((client) => {
          client.res.write(\`data: \${data}\\n\\n\`);
        });
      },
      (error) => {
        console.error('Firestore Companies Listener Error:', error);
      }
    );

    db.collection('products').onSnapshot(
      (snapshot) => {
        currentProducts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const data = JSON.stringify(currentProducts);

        productSseClients.forEach((client) => {
          client.res.write(\`data: \${data}\\n\\n\`);
        });
      },
      (error) => {
        console.error('Firestore Products Listener Error:', error);
      }
    );
  } catch (initError) {
    console.error('Firebase Admin SDK Initialization Error:', initError);
  }
}

// Initialize Redis with resilience`
);

// 4. Worker logic
content = content.replace(
  /const reviewRef = await addDoc\(collection\(db, 'reviews'\), \{([\s\S]*?)createdAt: serverTimestamp\(\),([\s\S]*?)\}\);/g,
  `const reviewRef = await db.collection('reviews').add({$1createdAt: admin.firestore.FieldValue.serverTimestamp(),$2});`
);

content = content.replace(
  /await addDoc\(collection\(db, 'sentiments'\), \{([\s\S]*?)createdAt: serverTimestamp\(\),([\s\S]*?)\}\);/g,
  `await db.collection('sentiments').add({$1createdAt: admin.firestore.FieldValue.serverTimestamp(),$2});`
);

content = content.replace(
  /await addDoc\(collection\(db, 'alerts'\), \{([\s\S]*?)createdAt: serverTimestamp\(\)([\s\S]*?)\}\);/g,
  `await db.collection('alerts').add({$1createdAt: admin.firestore.FieldValue.serverTimestamp()$2});`
);

// 5. Products cache
content = content.replace(
  /const snapshot = await getDocs\(collection\(db, 'products'\)\);/g,
  `const snapshot = await db.collection('products').get();`
);

// 6. Companies cache
content = content.replace(
  /const snapshot = await getDocs\(collection\(db, 'companies'\)\);/g,
  `const snapshot = await db.collection('companies').get();`
);

// 7. Dashboard stats cache
content = content.replace(
  /const q = query\(collection\(db, 'sentiments'\), orderBy\('createdAt', 'desc'\), limit\(100\)\);\n\s*const snapshot = await getDocs\(q\);/g,
  `const snapshot = await db.collection('sentiments').orderBy('createdAt', 'desc').limit(100).get();`
);

// 8. Full sentiments
content = content.replace(
  /const q = query\(collection\(db, 'sentiments'\), orderBy\('createdAt', 'desc'\)\);\n\s*const snapshot = await getDocs\(q\);/g,
  `const snapshot = await db.collection('sentiments').orderBy('createdAt', 'desc').get();`
);

// 9. Health endpoint
content = content.replace(
  /serverUid: auth\?\.currentUser\?\.uid,/g,
  `serverUid: 'admin-sdk',`
);

fs.writeFileSync('server.ts', content, 'utf8');
console.log('Done');