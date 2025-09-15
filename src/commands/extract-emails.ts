import fs from 'fs';
import path from 'path';

interface TeamMember {
  name: string;
  email: string;
}

interface TeamData {
  id: number;
  event_id: number;
  team_name: string;
  details: string;
  created_at: string;
  updated_at: string;
}

export async function extractEmails() {
  try {
    // Read the CSV file
    const csvPath = path.join(process.cwd(), 'uploads', 'mse.csv');
    
    if (!fs.existsSync(csvPath)) {
      console.error('CSV file not found at:', csvPath);
      return;
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    
    // Parse the CSV content - it's a JSON array on each line
    const lines = csvContent.trim().split('\n');
    const allEmails = new Set<string>();
    let processedLines = 0;
    let failedLines = 0;
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      
      // Skip empty lines
      if (!line) continue;
      
      // Check if line looks like it might be incomplete (doesn't end with })
      if (!line.endsWith('}') && !line.endsWith('},')) {
        console.warn(`Skipping incomplete line ${i + 1}: ${line.substring(0, 50)}...`);
        continue;
      }
      
      // Remove trailing comma if present
      if (line.endsWith(',')) {
        line = line.slice(0, -1);
      }
      
      try {
        // Parse the JSON line
        const teamData: TeamData = JSON.parse(line);
        
        // Parse the details field which contains the team members as a JSON string
        let teamMembers: TeamMember[] = [];
        
        try {
          teamMembers = JSON.parse(teamData.details);
        } catch (detailsError) {
          console.warn(`Error parsing details for team "${teamData.team_name}":`, detailsError.message);
          console.warn('Details content:', teamData.details.substring(0, 200) + '...');
          continue;
        }
        
        // Debug: log team name and member count
        console.log(`Processing team: ${teamData.team_name} (${teamMembers.length} members)`);
        
        // Extract emails from team members
        for (const member of teamMembers) {
          if (member.email && 
              member.email.trim() !== '' && 
              member.email !== 'Fogalmam sincs' && 
              member.email !== '…' &&
              member.email.includes('@')) {
            allEmails.add(member.email.trim().toLowerCase());
          }
        }
        
        processedLines++;
      } catch (error) {
        console.warn(`Error parsing line ${i + 1}:`, line.substring(0, 100) + '...');
        console.warn('Error details:', error.message);
        failedLines++;
        continue;
      }
    }
    
    // Convert Set to Array and sort
    const uniqueEmails = Array.from(allEmails).sort();
    
    console.log(`\n📊 Processing Summary:`);
    console.log(`   ✅ Successfully processed: ${processedLines} lines`);
    console.log(`   ❌ Failed to process: ${failedLines} lines`);
    console.log(`   📧 Found ${uniqueEmails.length} unique email addresses:\n`);
    console.log(JSON.stringify(uniqueEmails, null, 2));
    
    // Also save to a file for easy access
    const outputPath = path.join(process.cwd(), 'uploads', 'extracted-emails.json');
    fs.writeFileSync(outputPath, JSON.stringify(uniqueEmails, null, 2));
    console.log(`\n💾 Emails saved to: ${outputPath}\n`);
    
    return uniqueEmails;
    
  } catch (error) {
    console.error('Error extracting emails:', error);
    throw error;
  }
}

// If this file is run directly
if (require.main === module) {
  extractEmails()
    .then(() => {
      console.log('✅ Email extraction completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Email extraction failed:', error);
      process.exit(1);
    });
}
