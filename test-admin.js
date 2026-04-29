import * as admin from 'firebase-admin';
console.log('Keys of admin:', Object.keys(admin));
if (admin.default) {
  console.log('Keys of admin.default:', Object.keys(admin.default));
}
