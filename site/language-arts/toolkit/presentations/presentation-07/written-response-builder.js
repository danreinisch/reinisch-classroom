/**
 * Written Response Builder - External JavaScript
 * Handles all interactive functionality for the Written Response Builder tool
 */

// Word count functionality
function updateWordCount(textareaId, countId) {
  const textarea = document.getElementById(textareaId);
  const countElement = document.getElementById(countId);
  const text = textarea.value.trim();
  const wordCount = text === '' ? 0 : text.split(/\s+/).length;
  countElement.textContent = `${wordCount} words`;
}

// Topic sentence validation
function checkTopicSentence() {
  const input = document.getElementById('topicSentence');
  const feedback = document.getElementById('topicFeedback');
  const text = input.value.trim();
  const messages = [];
  if (!text) { feedback.innerHTML = ''; return; }

  if (text[0] === text[0].toLowerCase()) messages.push('<p class="error">Your sentence should start with a capital letter.</p>');
  if (!/[.!?]$/.test(text)) messages.push('<p class="error">Your sentence should end with proper punctuation (. ! or ?).</p>');
  if (text.endsWith('?')) messages.push('<p class="error">Topic sentences should be statements, not questions. Make a claim instead of asking.</p>');

  const words = text.split(/\s+/);
  if (text.length < 15) messages.push('<p class="error">Too short. A strong topic sentence needs more development (aim for at least 10-15 words).</p>');
  else if (words.length < 8) messages.push('<p class="warn">Your sentence is quite brief. Consider adding more detail about your main point.</p>');
  else if (words.length <= 25) messages.push('<p>✔️ Good sentence length.</p>');
  else messages.push('<p class="warn">Your sentence is quite long. Consider breaking it into two sentences or simplifying.</p>');

  const weakStarters = /^(i think|i believe|i feel|in my opinion|i guess|i would say|this essay|this paragraph|this paper)/i;
  if (weakStarters.test(text)) messages.push('<p class="error">Avoid weak starters like "I think," "I believe," or "This essay." State your claim directly and confidently.</p>');

  if (/^(yes|no|maybe|sure|not really|kind of|sort of)/i.test(text)) messages.push('<p class="error">This sounds like a simple answer, not a topic sentence. Restate the question as a complete claim in your own words.</p>');

  const pronouns = ["he","she","they","it","we","you","i"];
  const contentWords = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
  const mainWords = contentWords.filter(w => w.length > 3 && !pronouns.includes(w));
  if (mainWords.length === 0) messages.push('<p class="error">Your sentence needs a clear, specific subject. What exactly are you writing about?</p>');
  else if (mainWords.length < 3) messages.push('<p class="warn">Your topic sentence could be more specific. Add more detail about your subject.</p>');
  else messages.push('<p>✔️ Your sentence has a clear subject.</p>');

  const vagueWords = /(thing|stuff|good|bad|nice|interesting|a lot|very|really|some|many)/i;
  if (vagueWords.test(text)) messages.push('<p class="warn">Try to be more specific. Avoid vague words like "thing," "stuff," "good," "bad," "nice," "interesting," etc.</p>');

  const purposefulPatterns = /(should|must|because|since|therefore|demonstrates|proves|shows|reveals|argues|suggests|explains|indicates|illustrates|the main reason|one reason|the primary|the key|the most important)/i;
  if (purposefulPatterns.test(text)) messages.push('<p>✔️ Your sentence has clear direction and purpose. Excellent!</p>');
  else messages.push('<p class="warn">Your sentence needs stronger direction. Include words that show your position or reasoning (e.g., "because," "demonstrates," "proves," "should").</p>');

  if (/will (discuss|talk about|explain|write about|tell you)/i.test(text)) messages.push('<p class="error">Don\'t announce what you\'ll do ("I will discuss..."). Instead, make your claim directly.</p>');

  const sentenceCount = (text.match(/[.!?]+/g) || []).length;
  if (sentenceCount > 1) messages.push('<p class="warn">A topic sentence should typically be ONE sentence. Consider combining your ideas or using only the strongest one.</p>');

  if (/n't|'re|'ve|'ll|'d|'s/.test(text)) messages.push('<p class="warn">Avoid contractions in formal writing. Write out "don\'t" as "do not," etc.</p>');

  const errorCount = messages.filter(m => m.includes('class="error"')).length;
  const warnCount = messages.filter(m => m.includes('class="warn"')).length;
  if (errorCount === 0 && warnCount === 0) messages.push('<p style="background: rgba(16,185,129,.2); font-weight: bold;">🌟 Excellent topic sentence! This is ready to use.</p>');
  else if (errorCount === 0 && warnCount <= 2) messages.push('<p style="background: rgba(34,197,94,.15);">✅ Good topic sentence! Consider addressing the suggestions above to make it even stronger.</p>');
  else if (errorCount > 0) messages.push('<p style="background: rgba(239,68,68,.2); font-weight: bold;">⚠️ This needs revision. Please address the errors above before continuing.</p>');

  feedback.innerHTML = messages.join('');
}

// Supporting detail validation
function checkSupportingDetail(detailId, feedbackId) {
  const detail = document.getElementById(detailId);
  const feedback = document.getElementById(feedbackId);
  const topicSentence = document.getElementById('topicSentence').value.trim();
  const text = detail.value.trim();
  const messages = [];
  if (!text) { feedback.innerHTML = ''; return; }

  const words = text.split(/\s+/);
  if (words.length < 15) messages.push('<p class="error">Too short. Supporting details need substantial development (aim for at least 15-20 words).</p>');
  else if (words.length < 20) messages.push('<p class="warn">Consider adding more detail. Strong supporting details typically have 20+ words.</p>');
  else if (words.length <= 75) messages.push('<p>✔️ Good detail length.</p>');
  else messages.push('<p class="warn">Your detail is quite long. Consider breaking it into multiple sentences or being more concise.</p>');

  const hasEvidence = /(for example|for instance|such as|specifically|according to|shows that|demonstrates|proves|illustrates|evidence|data|study|research|")/i.test(text);
  if (hasEvidence) messages.push('<p>✔️ Good! You included specific evidence or examples.</p>');
  else messages.push('<p class="warn">Try to include specific evidence, examples, or data to support your claim.</p>');

  const hasExplanation = /(this shows|this demonstrates|this means|this proves|this illustrates|because|therefore|as a result|consequently|thus)/i.test(text);
  if (hasExplanation) messages.push('<p>✔️ Good! You explained how your evidence supports your point.</p>');
  else messages.push('<p class="warn">Explain how your evidence connects to your topic sentence.</p>');

  if (topicSentence) {
    const topicKeyWords = topicSentence.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 4);
    const detailLower = text.toLowerCase();
    const hasConnection = topicKeyWords.some(word => detailLower.includes(word));
    if (!hasConnection && topicKeyWords.length > 0) messages.push('<p class="warn">This detail doesn\'t clearly connect to your topic sentence. Make sure it supports your main argument.</p>');
  }

  if (!/[.!?]$/.test(text)) messages.push('<p class="error">Your detail should end with proper punctuation.</p>');

  const errorCount = messages.filter(m => m.includes('class="error"')).length;
  if (errorCount === 0 && messages.length <= 3) messages.push('<p style="background: rgba(16,185,129,.2);">✅ Strong supporting detail!</p>');

  feedback.innerHTML = messages.join('');
}

// Conclusion validation
function checkConclusion() {
  const conclusion = document.getElementById('conclusion');
  const feedback = document.getElementById('conclusionFeedback');
  const topicSentence = document.getElementById('topicSentence').value.trim();
  const text = conclusion.value.trim();
  const messages = [];
  if (!text) { feedback.innerHTML = ''; return; }

  const words = text.split(/\s+/);
  if (words.length < 20) messages.push('<p class="error">Too short. Conclusions should restate your thesis and summarize key points (aim for at least 20 words).</p>');
  else if (words.length <= 60) messages.push('<p>✔️ Good conclusion length.</p>');
  else messages.push('<p class="warn">Your conclusion is quite long. Keep it concise while restating your main points.</p>');

  if (!/[.!?]$/.test(text)) messages.push('<p class="error">Your conclusion should end with proper punctuation.</p>');

  const introducesNew = /(new|another|also|additionally|furthermore|first time|never mentioned)/i.test(text);
  if (introducesNew) messages.push('<p class="warn">Avoid introducing completely new ideas in your conclusion. Focus on summarizing what you already discussed.</p>');

  if (topicSentence) {
    const topicLower = topicSentence.toLowerCase();
    const conclusionLower = text.toLowerCase();
    const topicWords = topicLower.replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 4);
    const sharedWords = topicWords.filter(word => conclusionLower.includes(word));
    if (sharedWords.length === 0 && topicWords.length > 0) {
      messages.push('<p class="error">Your conclusion doesn\'t connect to your topic sentence. Restate your main argument in different words.</p>');
    } else if (sharedWords.length > 0) {
      const similarity = sharedWords.length / topicWords.length;
      if (similarity > 0.7 && topicSentence.length > 30) {
        const topicStart = topicLower.substring(0, 40);
        const conclusionStart = conclusionLower.substring(0, 40);
        if (topicStart === conclusionStart) {
          messages.push('<p class="warn">Your conclusion is too similar to your topic sentence. Restate your thesis using different words.</p>');
        } else {
          messages.push('<p>✔️ Good! Your conclusion restates your main argument.</p>');
        }
      } else {
        messages.push('<p>✔️ Good! Your conclusion connects to your topic sentence.</p>');
      }
    }
  }

  const hasSummary = /(in conclusion|to summarize|in summary|overall|ultimately|therefore|thus|as shown|as demonstrated)/i.test(text);
  if (hasSummary) messages.push('<p>✔️ Good use of concluding language.</p>');

  const weakEndings = /(that is all|the end|that's it|i'm done|this concludes|in this essay i|i have shown)/i;
  if (weakEndings.test(text)) messages.push('<p class="warn">Avoid weak endings. End with a strong statement or thought-provoking insight.</p>');

  const hasImpact = /(important|significant|matters|crucial|essential|should|must|needs|future|impact|consequence)/i.test(text);
  if (hasImpact) messages.push('<p>✔️ Good! You emphasized the importance or broader implications of your argument.</p>');
  else messages.push('<p class="warn">Consider ending with why your argument matters or what readers should take away.</p>');

  const errorCount = messages.filter(m => m.includes('class="error"')).length;
  if (errorCount === 0 && messages.length <= 4) messages.push('<p style="background: rgba(16,185,129,.2);">✅ Strong conclusion!</p>');

  feedback.innerHTML = messages.join('');
}

// Generate the full response text
function generateResponse() {
  const topic = document.getElementById('topicSentence').value;
  const detail1 = document.getElementById('supportingDetail1').value;
  const detail2 = document.getElementById('supportingDetail2').value;
  const detail3 = document.getElementById('supportingDetail3').value;
  const conclusionText = document.getElementById('conclusion').value;

  const transition1 = document.getElementById('transition1').value;
  const transition2 = document.getElementById('transition2').value;
  const transition3 = document.getElementById('transition3').value;
  const transitionConc = document.getElementById('transitionConclusion').value;

  let response = '';
  if (topic.trim()) response += `${topic} `;
  if (detail1.trim()) response += `${transition1 ? transition1 + ' ' : ''}${detail1} `;
  if (detail2.trim()) response += `${transition2 ? transition2 + ' ' : ''}${detail2} `;
  if (detail3.trim()) response += `${transition3 ? transition3 + ' ' : ''}${detail3} `;
  if (conclusionText.trim()) response += `${transitionConc ? transitionConc + ' ' : ''}${conclusionText}`;
  return response.trim();
}

// Clear all content
function clearAll() {
  if (!confirm('Are you sure you want to clear all content?')) return;
  ['topicSentence','supportingDetail1','supportingDetail2','supportingDetail3','conclusion'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['transition1','transition2','transition3','transitionConclusion'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['topicFeedback','detail1Feedback','detail2Feedback','detail3Feedback','conclusionFeedback'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
  updateWordCount('topicSentence','topicWordCount');
  updateWordCount('supportingDetail1','detail1WordCount');
  updateWordCount('supportingDetail2','detail2WordCount');
  updateWordCount('supportingDetail3','detail3WordCount');
  updateWordCount('conclusion','conclusionWordCount');
}

// Helper function to safely escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Preview response in modal
function previewResponse() {
  const response = generateResponse();
  if (response.trim() === '') { alert('Please write something before previewing!'); return; }
  const escapedResponse = escapeHtml(response);
  const formattedResponse = escapedResponse.replace(/\n\n/g, '</p><p>');
  document.getElementById('previewText').innerHTML = `<p>${formattedResponse}</p>`;
  document.getElementById('previewModal').style.display = 'block';
}

// Close preview modal
function closePreview() {
  document.getElementById('previewModal').style.display = 'none';
}

// Copy response to clipboard
function copyResponse() {
  const response = generateResponse();
  if (response.trim() === '') { 
    alert('Please write something before copying!'); 
    return; 
  }
  
  const plainText = response.replace(/<[^>]*>/g, '');
  
  // Try modern clipboard API first
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(plainText)
      .then(() => {
        // Change button text temporarily to show success
        const btn = document.querySelector('.btn-success');
        const originalText = btn.textContent;
        btn.textContent = '✓ Copied!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      })
      .catch(() => {
        // Fallback if modern API fails
        fallbackCopy(plainText);
      });
  } else {
    // Use fallback for older browsers
    fallbackCopy(plainText);
  }
}

// Fallback copy method for older browsers
function fallbackCopy(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  try {
    document.execCommand('copy');
    const btn = document.querySelector('.btn-success');
    const originalText = btn.textContent;
    btn.textContent = '✓ Copied!';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  } catch (err) {
    alert('Failed to copy. Please select and copy the text manually.');
  }
  
  document.body.removeChild(textArea);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Setup input listeners for word count and validation
  const bindings = [
    { id: 'topicSentence',    counter: 'topicWordCount',     onInput: () => checkTopicSentence() },
    { id: 'supportingDetail1',counter: 'detail1WordCount',   onInput: () => checkSupportingDetail('supportingDetail1','detail1Feedback') },
    { id: 'supportingDetail2',counter: 'detail2WordCount',   onInput: () => checkSupportingDetail('supportingDetail2','detail2Feedback') },
    { id: 'supportingDetail3',counter: 'detail3WordCount',   onInput: () => checkSupportingDetail('supportingDetail3','detail3Feedback') },
    { id: 'conclusion',       counter: 'conclusionWordCount',onInput: () => checkConclusion() },
  ];
  
  bindings.forEach(b => {
    const el = document.getElementById(b.id);
    if (!el) return;
    const handler = () => { updateWordCount(b.id, b.counter); b.onInput(); };
    handler(); // initialize
    el.addEventListener('input', handler);
  });

  // Setup button event listeners
  const clearBtn = document.querySelector('.btn-secondary');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearAll);
  }

  const previewBtn = document.querySelector('.btn-primary');
  if (previewBtn) {
    previewBtn.addEventListener('click', previewResponse);
  }

  const copyBtn = document.querySelector('.btn-success');
  if (copyBtn) {
    copyBtn.addEventListener('click', copyResponse);
  }

  // Setup modal close on background click
  const modal = document.getElementById('previewModal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === this) closePreview();
    });
  }

  // Setup close button in modal
  const closeBtn = modal ? modal.querySelector('.btn-secondary') : null;
  if (closeBtn) {
    closeBtn.addEventListener('click', closePreview);
  }

  // Language Arts return button injection (moved from inline script)
  try {
    var btn = document.createElement('a');
    var origin = (window.location && window.location.origin) ? window.location.origin : '';
    btn.href = origin + '/language-arts/';
    btn.textContent = '← Language Arts';
    btn.setAttribute('aria-label', 'Return to Language Arts');
    btn.style.position = 'fixed';
    btn.style.top = '1rem';
    btn.style.left = '1rem';
    btn.style.zIndex = '1000';
    btn.style.background = 'rgba(255,255,255,0.12)';
    btn.style.border = '1px solid rgba(255, 255, 255, 0.25)';
    btn.style.padding = '.6rem 1rem';
    btn.style.borderRadius = '.6rem';
    btn.style.color = '#fff';
    btn.style.textDecoration = 'none';
    btn.style.backdropFilter = 'blur(10px)';
    btn.style.webkitBackdropFilter = 'blur(10px)';
    btn.style.transition = 'background .2s, transform .2s';
    btn.addEventListener('mouseenter', function(){ btn.style.background = 'rgba(255,255,255,0.24)'; btn.style.transform='translateY(-1px)'; });
    btn.addEventListener('mouseleave', function(){ btn.style.background = 'rgba(255,255,255,0.12)'; btn.style.transform='translateY(0)'; });
    document.body.appendChild(btn);
  } catch (e) {
    console.error('Failed to add Language Arts button', e);
  }
});
