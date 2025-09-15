import fs from 'fs';
import path from 'path';

interface EmailFilter {
  isValid: boolean;
  reason?: string;
}

function validateEmail(email: string): EmailFilter {
  const trimmedEmail = email.trim().toLowerCase();
  
  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return { isValid: false, reason: 'Invalid email format' };
  }
  
  // Check for obviously fake domains
  const fakeDomains = [
    'vmi.com', 'vmi.hu', 'cmi.com', 'asd.com', 'be.fr', 'beh.nh',
    'kukac', 'j.hu', 'g.hu', 'k.hu', 'k.com', 'hehs.hu', 'hshs.hu',
    'zsila.hu', 'zsila.zsila', 'ok.ok', 'kifli.com', 'tekos.hu',
    'beerpongmail.hu', 'esnemisfogom.tudni', 'nemtudom.com',
    'nemtudom', 'hormail.com', 'hotnail.com', 'gnail.com', 'bmegtkhk.hu'
  ];
  
  const domain = trimmedEmail.split('@')[1];
  if (fakeDomains.includes(domain)) {
    return { isValid: false, reason: `Fake domain: ${domain}` };
  }
  
  // Check for obviously fake local parts
  const fakeLocalParts = [
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
    '123', '1234', 'passz', 'idk', 'boba', 'karcsi', 'sanyi', 'vmi', 'cmi', 'hd', 'sj', 'gcs', 'n.a', 'ok', 'j', 'k', 'h'
  ];
  
  const localPart = trimmedEmail.split('@')[0];
  if (fakeLocalParts.includes(localPart)) {
    return { isValid: false, reason: `Fake local part: ${localPart}` };
  }
  
  // Check for placeholder text
  const placeholderTexts = [
    'fogalmam sincs', 'nem@tudom', 'nemtudom', 'nemtkm', 'azttejobbantudod',
    'megmindignemtudom', 'wasistdas', 'fulivagyok'
  ];
  
  if (placeholderTexts.some(placeholder => trimmedEmail.includes(placeholder))) {
    return { isValid: false, reason: 'Contains placeholder text' };
  }
  
  // Check for incomplete emails (missing parts)
  if (trimmedEmail.endsWith('@') || trimmedEmail.startsWith('@')) {
    return { isValid: false, reason: 'Incomplete email' };
  }
  
  // Check for emails that are too short (likely fake)
  if (localPart.length < 2) {
    return { isValid: false, reason: 'Local part too short' };
  }
  
  // Check for emails with only numbers in local part
  if (/^\d+$/.test(localPart)) {
    return { isValid: false, reason: 'Local part contains only numbers' };
  }
  
  // Check for common typos in domains
  const commonTypos = ['gmai.com', 'gnail.com', 'hormail.com', 'hotnail.com'];
  if (commonTypos.includes(domain)) {
    return { isValid: false, reason: `Typo in domain: ${domain}` };
  }
  
  // Check for emails with suspicious patterns
  if (trimmedEmail.includes('..') || trimmedEmail.includes('@@')) {
    return { isValid: false, reason: 'Contains double dots or @ symbols' };
  }
  
  return { isValid: true };
}

export async function filterEmails() {
  try {
    // Read the extracted emails file
    const emailsPath = path.join(process.cwd(), 'uploads', 'extracted-emails.json');
    
    if (!fs.existsSync(emailsPath)) {
      console.error('Extracted emails file not found. Please run extract-emails first.');
      return;
    }

    const emails: string[] = JSON.parse(fs.readFileSync(emailsPath, 'utf-8'));
    
    console.log(`\n🔍 Filtering ${emails.length} email addresses...\n`);
    
    const validEmails: string[] = [];
    const invalidEmails: { email: string; reason: string }[] = [];
    
    for (const email of emails) {
      const validation = validateEmail(email);
      
      if (validation.isValid) {
        validEmails.push(email);
      } else {
        invalidEmails.push({ email, reason: validation.reason || 'Unknown reason' });
      }
    }
    
    // Sort results
    validEmails.sort();
    invalidEmails.sort((a, b) => a.email.localeCompare(b.email));
    
    // Display results
    console.log(`📊 Filtering Results:`);
    console.log(`   ✅ Valid emails: ${validEmails.length}`);
    console.log(`   ❌ Invalid emails: ${invalidEmails.length}`);
    console.log(`   📈 Success rate: ${((validEmails.length / emails.length) * 100).toFixed(1)}%\n`);
    
    // Show some examples of invalid emails
    if (invalidEmails.length > 0) {
      console.log(`🚫 Examples of invalid emails:`);
      const examples = invalidEmails.slice(0, 10);
      examples.forEach(({ email, reason }) => {
        console.log(`   • ${email} (${reason})`);
      });
      if (invalidEmails.length > 10) {
        console.log(`   ... and ${invalidEmails.length - 10} more`);
      }
      console.log('');
    }
    
    // Save filtered results
    const validEmailsPath = path.join(process.cwd(), 'uploads', 'valid-emails.json');
    const invalidEmailsPath = path.join(process.cwd(), 'uploads', 'invalid-emails.json');
    
    fs.writeFileSync(validEmailsPath, JSON.stringify(validEmails, null, 2));
    fs.writeFileSync(invalidEmailsPath, JSON.stringify(invalidEmails, null, 2));
    
    console.log(`💾 Valid emails saved to: ${validEmailsPath}`);
    console.log(`💾 Invalid emails saved to: ${invalidEmailsPath}\n`);
    
    // Display valid emails
    console.log(`📧 Valid Email Addresses (${validEmails.length}):\n`);
    console.log(JSON.stringify(validEmails, null, 2));
    
    return { validEmails, invalidEmails };
    
  } catch (error) {
    console.error('Error filtering emails:', error);
    throw error;
  }
}

// If this file is run directly
if (require.main === module) {
  filterEmails()
    .then(() => {
      console.log('✅ Email filtering completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Email filtering failed:', error);
      process.exit(1);
    });
}
