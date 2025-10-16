// Wrapper to load environment variables before importing TypeScript modules
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

// Now run the TypeScript test
require('tsx/cjs').register();
require('./test-case-classification.ts');
