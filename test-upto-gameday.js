// Simple test script to verify uptoGameDay behavior
const { db } = require('./src/db');
const { matches } = require('./src/database/schema');
const { eq, and, lt, lte } = require('drizzle-orm');

async function testUptoGameDay() {
  console.log('Testing uptoGameDay filter behavior...');
  
  // Test with a sample league ID (replace with actual ID from your database)
  const testLeagueId = '9cde3391-8e25-474d-8aab-2df85a4a15a2';
  
  try {
    // Test 1: Get all matches for the league
    const allMatches = await db.select().from(matches)
      .where(and(
        eq(matches.leagueId, testLeagueId),
        eq(matches.matchStatus, 'completed')
      ));
    
    console.log(`Total completed matches: ${allMatches.length}`);
    
    // Group by gameDay
    const byGameDay = {};
    allMatches.forEach(match => {
      const gd = match.gameDay;
      if (!byGameDay[gd]) byGameDay[gd] = [];
      byGameDay[gd].push(match);
    });
    
    console.log('Matches by gameDay:');
    Object.keys(byGameDay).sort((a, b) => a - b).forEach(gd => {
      console.log(`  GameDay ${gd}: ${byGameDay[gd].length} matches`);
    });
    
    // Test 2: uptoGameDay = 2 (should include only gameDay 1)
    console.log('\nTesting uptoGameDay = 2 (should include only gameDay 1):');
    const uptoGameDay2 = await db.select().from(matches)
      .where(and(
        eq(matches.leagueId, testLeagueId),
        eq(matches.matchStatus, 'completed'),
        lt(matches.gameDay, 2)  // This is the new behavior
      ));
    
    console.log(`Matches with gameDay < 2: ${uptoGameDay2.length}`);
    
    // Test 3: Compare with old behavior (lte)
    console.log('\nTesting old behavior (lte) for comparison:');
    const uptoGameDay2Old = await db.select().from(matches)
      .where(and(
        eq(matches.leagueId, testLeagueId),
        eq(matches.matchStatus, 'completed'),
        lte(matches.gameDay, 2)  // This is the old behavior
      ));
    
    console.log(`Matches with gameDay <= 2: ${uptoGameDay2Old.length}`);
    
    // Test 4: Specific gameDay = 2
    console.log('\nTesting specific gameDay = 2:');
    const specificGameDay2 = await db.select().from(matches)
      .where(and(
        eq(matches.leagueId, testLeagueId),
        eq(matches.matchStatus, 'completed'),
        eq(matches.gameDay, 2)
      ));
    
    console.log(`Matches with gameDay = 2: ${specificGameDay2.length}`);
    
    console.log('\nSummary:');
    console.log(`- New uptoGameDay=2 (lt): ${uptoGameDay2.length} matches`);
    console.log(`- Old uptoGameDay=2 (lte): ${uptoGameDay2Old.length} matches`);
    console.log(`- Specific gameDay=2: ${specificGameDay2.length} matches`);
    console.log(`- Difference (old - new): ${uptoGameDay2Old.length - uptoGameDay2.length} matches`);
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testUptoGameDay().then(() => {
  console.log('Test completed');
  process.exit(0);
}).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
