/**
 * Clear ALL data from the database for fresh testing.
 * Only keeps the admin user account.
 * Usage: node clear_db.js
 */
const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://vema:vema@cluster0.wouqskm.mongodb.net/';

async function clearAll() {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    
    // Get counts before clearing
    const collections = [
        'employees',
        'users',
        'transactions',
        'loans',
        'adjustmenthistories',
        'monthlyuploadlogs',
        'balancesheetmonths',
        'archivedmonths'
    ];
    
    console.log('\n── Before Clearing ──');
    for (const name of collections) {
        try {
            const count = await db.collection(name).countDocuments();
            console.log(`  ${name}: ${count}`);
        } catch { /* collection may not exist */ }
    }
    
    // Clear everything
    for (const name of collections) {
        try {
            if (name === 'users') {
                // Keep the admin user
                const result = await db.collection(name).deleteMany({ role: { $ne: 'admin' } });
                console.log(`\n  Cleared ${name}: ${result.deletedCount} deleted (admin kept)`);
            } else {
                const result = await db.collection(name).deleteMany({});
                console.log(`  Cleared ${name}: ${result.deletedCount} deleted`);
            }
        } catch { /* collection may not exist */ }
    }
    
    // Verify
    console.log('\n── After Clearing ──');
    for (const name of collections) {
        try {
            const count = await db.collection(name).countDocuments();
            console.log(`  ${name}: ${count}`);
        } catch { /* collection may not exist */ }
    }
    
    // Check admin user still exists
    const adminUser = await db.collection('users').findOne({ role: 'admin' });
    console.log(`\n  Admin account: ${adminUser ? `✅ ${adminUser.username}` : '❌ MISSING'}`);
    
    await mongoose.disconnect();
    console.log('\nDatabase cleared! Ready for fresh testing.\n');
}

clearAll().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
