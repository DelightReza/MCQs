import type { Question, Option, QBank } from '../types';

function extractMediaAndClean(text: string): { text: string; media: string[] } {
  const media: string[] = [];
  if (!text) return { text: '', media };
  const regex = /MEDIA:\s*([^\s]+)/gi;
  let cleaned = text.replace(regex, (match, path) => {
    // Strip leading ./
    media.push(path.trim().replace(/^\.\//, ''));
    return '';
  });
  cleaned = cleaned.replace(/:\s*$/, '').trim();
  return { text: cleaned, media };
}

export function parseQBankString(content: string, prefix = 'q'): Question[] {
  const blocks = content.split(/---/g).map(b => b.trim()).filter(Boolean);
  return blocks.map((block, index) => {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    
    let isStructured = /(^|\n)\s*OPTION:/m.test(block) || /(^|\n)\s*CORRECT:/m.test(block);

    let text = '';
    let questionMedia: string[] = [];
    let options: Option[] = [];
    let correctAnswerIndex = 0;

    if (!isStructured) {
      const qLineIndex = lines.findIndex(l => l.startsWith('Q:'));
      let optionsLines = [];

      if (qLineIndex !== -1) {
        text = lines[qLineIndex].replace(/^Q:\s*/, '').trim();
        optionsLines = lines.filter((_, i) => i !== qLineIndex);
      } else {
        const firstOptIndex = lines.findIndex(l => /^[*+]\s+/.test(l));
        if (firstOptIndex > 0) {
          text = lines.slice(0, firstOptIndex).join(' ');
          optionsLines = lines.slice(firstOptIndex);
        } else {
          text = lines[0] || '';
          optionsLines = lines.slice(1);
        }
      }
      
      const qCleaned = extractMediaAndClean(text);
      text = qCleaned.text;
      questionMedia = qCleaned.media;

      options = optionsLines.map((opt, i) => {
        let isCorrect = false;
        if (/^[*+]\s/.test(opt)) {
          isCorrect = true;
          correctAnswerIndex = i;
          opt = opt.replace(/^[*+]\s*/, '').trim();
        }
        
        const optCleaned = extractMediaAndClean(opt);
        return {
          text: optCleaned.text,
          media: optCleaned.media
        };
      });
    } else {
      // Structured Parse
      let currentOpt: Option | null = null;
      let inOptions = false;
      const parsedOptions: Option[] = [];
      let isCorrect = false;
      
      for(const line of lines) {
        if(line.startsWith('Q:')) {
           text = line.replace(/^Q:\s*/, '').trim();
        } else if(line === 'OPTION:') {
           inOptions = true;
           currentOpt = { text: '' };
           parsedOptions.push(currentOpt);
        } else if(line.toUpperCase().startsWith('MEDIA:')) {
           const mediaPath = line.replace(/^MEDIA:\s*/i, '').trim().replace(/^\.\//, '');
           if(currentOpt && inOptions) {
             currentOpt.media = currentOpt.media || [];
             currentOpt.media.push(mediaPath);
           } else {
             questionMedia.push(mediaPath);
           }
        } else if(line.toUpperCase().startsWith('CORRECT:') && currentOpt) {
           const corrStr = line.replace(/^CORRECT:\s*/i, '').trim().toLowerCase();
           if(corrStr === 'true') {
             correctAnswerIndex = parsedOptions.length - 1;
           }
        } else if(line.toUpperCase().startsWith('TEXT:') && currentOpt) {
           currentOpt.text = line.replace(/^TEXT:\s*/i, '').trim();
        } else if(!inOptions) {
           text += ' ' + line;
        }
      }
      text = text.trim();
      
      const qCleaned = extractMediaAndClean(text);
      text = qCleaned.text;
      questionMedia = [...questionMedia, ...qCleaned.media];
      options = parsedOptions.filter(o => o.text || (o.media && o.media.length));
    }

    return {
      id: prefix + "-" + index,
      text,
      media: questionMedia,
      options,
      correctAnswerIndex,
    };
  }).filter(q => q.text && q.options.length > 0);
}

export async function fetchQBanks(): Promise<QBank[]> {
  try {
    const res = await fetch('./qbanks.json');
    if (!res.ok) throw new Error('Could not load qbanks.json');
    const meta = await res.json();
    const banks = meta.question_banks || [];
    
    const results: QBank[] = [];
    for (const bank of banks) {
      try {
        const fileRes = await fetch('./questionbanks/' + bank.file);
        if (fileRes.ok) {
          const content = await fileRes.text();
          const questions = parseQBankString(content, bank.file);
          if (questions.length > 0) {
            results.push({
              id: bank.file,
              name: bank.title,
              questions
            });
          }
        }
      } catch (e) {
        console.error('Error fetching bank:', bank.file, e);
      }
    }
    
    return results;
  } catch(e) {
    console.error('Failed to load remote Q banks, using fallback.');
    return [];
  }
}

