// Prints a fresh VAPID key pair for Web Push. Store them as VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:you@example.com');
