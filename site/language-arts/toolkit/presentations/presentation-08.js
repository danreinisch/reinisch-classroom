/**
 * 5-Paragraph Essay Builder - External JavaScript
 * Handles all interactive functionality for the essay building tool
 */

function countWords(text) {
    const trimmed = text.trim();
    return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

function updateWordCount(ids, countId) {
    let totalWords = 0;
    ids.forEach(id => {
        const elem = document.getElementById(id);
        if (elem) {
            totalWords += countWords(elem.value);
        }
    });
    document.getElementById(countId).textContent = `${totalWords} words`;
}

function checkSentenceBasics(text, feedbackId) {
    const feedback = document.getElementById(feedbackId);
    const messages = [];

    if (!text.trim()) {
        feedback.innerHTML = '';
        return;
    }

    if (text[0] === text[0].toLowerCase()) {
        messages.push('<p class="error">Start with a capital letter.</p>');
    }

    if (!/[.!?]$/.test(text.trim())) {
        messages.push('<p class="error">End with proper punctuation (. ! or ?).</p>');
    }

    if (text.trim().endsWith('?')) {
        messages.push('<p class="warn">Consider using a statement rather than a question.</p>');
    }

    const words = text.split(/\s+/);
    if (text.length < 15) {
        messages.push('<p class="error">Too short. Add more detail.</p>');
    } else if (words.length >= 8 && words.length <= 30) {
        messages.push('<p>✔️ Good sentence length.</p>');
    } else if (words.length > 30) {
        messages.push('<p class="warn">This sentence is quite long. Consider breaking it up.</p>');
    }

    if (/n't|'re|'ve|'ll|'d|'s/.test(text)) {
        messages.push('<p class="warn">Avoid contractions in formal essays.</p>');
    }

    feedback.innerHTML = messages.join('');
}

function checkHook() {
    const text = document.getElementById('hook').value.trim();
    const feedback = document.getElementById('hookFeedback');
    const messages = [];

    if (!text) {
        feedback.innerHTML = '';
        return;
    }

    checkSentenceBasics(text, 'hookFeedback');

    const hookPatterns = /(imagine|what if|did you know|have you ever|picture this|consider)/i;
    if (hookPatterns.test(text)) {
        messages.push('<p>✔️ Great engaging hook!</p>');
    } else {
        messages.push('<p class="warn">Try to make your hook more engaging with a question, scenario, or surprising fact.</p>');
    }

    const weakStarters = /^(this essay|this paper|in this essay|i will)/i;
    if (weakStarters.test(text)) {
        messages.push('<p class="error">Don\'t announce what you\'re doing. Start with an engaging hook instead.</p>');
    }

    feedback.innerHTML += messages.join('');
}

function checkThesis() {
    const text = document.getElementById('thesis').value.trim();
    const feedback = document.getElementById('thesisFeedback');
    const messages = [];

    if (!text) {
        feedback.innerHTML = '';
        return;
    }

    checkSentenceBasics(text, 'thesisFeedback');

    const weakStarters = /^(i think|i believe|i feel|in my opinion)/i;
    if (weakStarters.test(text)) {
        messages.push('<p class="error">State your thesis directly without "I think" or "I believe".</p>');
    }

    const words = text.split(/\s+/);
    if (words.length < 12) {
        messages.push('<p class="warn">Your thesis seems brief. It should preview your three main points.</p>');
    }

    const strongIndicators = /(because|demonstrates|proves|shows|reveals|three|first.*second.*third)/i;
    if (strongIndicators.test(text)) {
        messages.push('<p>✔️ Strong thesis with clear direction!</p>');
    } else {
        messages.push('<p class="warn">Try to preview your three main points in your thesis.</p>');
    }

    feedback.innerHTML += messages.join('');
}

function checkTopicSentence(id, feedbackId) {
    const text = document.getElementById(id).value.trim();
    const feedback = document.getElementById(feedbackId);
    const messages = [];

    if (!text) {
        feedback.innerHTML = '';
        return;
    }

    checkSentenceBasics(text, feedbackId);

    const weakStarters = /^(i think|i believe|this paragraph|the first|the second|the third)/i;
    if (weakStarters.test(text)) {
        messages.push('<p class="error">State your point directly without weak starters.</p>');
    }

    const purposefulPatterns = /(should|must|because|since|therefore|demonstrates|proves|shows|reveals)/i;
    if (purposefulPatterns.test(text)) {
        messages.push('<p>✔️ Clear topic sentence with strong direction!</p>');
    } else {
        messages.push('<p class="warn">Add stronger language to show your point (e.g., "demonstrates," "proves," "because").</p>');
    }

    const vagueWords = /(thing|stuff|good|bad|nice|interesting)/i;
    if (vagueWords.test(text)) {
        messages.push('<p class="warn">Be more specific. Avoid vague words like "thing," "good," "bad," or "interesting".</p>');
    }

    feedback.innerHTML += messages.join('');
}

function checkConclusion() {
    const text = document.getElementById('restatedThesis').value.trim();
    const thesis = document.getElementById('thesis').value.trim();
    const feedback = document.getElementById('conclusionFeedback');
    const messages = [];

    if (!text) {
        feedback.innerHTML = '';
        return;
    }

    checkSentenceBasics(text, 'conclusionFeedback');

    if (thesis && text.toLowerCase() === thesis.toLowerCase()) {
        messages.push('<p class="error">Don\'t copy your thesis exactly. Restate it in different words.</p>');
    } else if (thesis && text.length > 10) {
        messages.push('<p>✔️ Good job restating your thesis in new words!</p>');
    }

    const newInfo = /^(a new|another|also|additionally)/i;
    if (newInfo.test(text)) {
        messages.push('<p class="error">Don\'t introduce new information in your conclusion.</p>');
    }

    feedback.innerHTML += messages.join('');
}

function clearAll() {
    if (confirm('Are you sure you want to clear all content?')) {
        const allInputs = [
            'promptInput', 'hook', 'background', 'thesis',
            'body1Topic', 'body1Evidence', 'body1Concluding',
            'body2Topic', 'body2Evidence', 'body2Concluding',
            'body3Topic', 'body3Evidence', 'body3Concluding',
            'restatedThesis', 'summary', 'closingThought'
        ];
        
        allInputs.forEach(id => {
            const elem = document.getElementById(id);
            if (elem) elem.value = '';
        });

        const transitions = ['transition1', 'transition2', 'transition3', 'transitionConclusion'];
        transitions.forEach(id => {
            const elem = document.getElementById(id);
            if (elem) elem.value = '';
        });

        const feedbacks = ['hookFeedback', 'thesisFeedback', 'body1TopicFeedback', 
                          'body2TopicFeedback', 'body3TopicFeedback', 'conclusionFeedback'];
        feedbacks.forEach(id => {
            const elem = document.getElementById(id);
            if (elem) elem.innerHTML = '';
        });

        sections.forEach(section => updateWordCount(section.ids, section.counter));
    }
}

function generateEssay() {
    const prompt = document.getElementById('promptInput').value;
    let essay = '';

    if (prompt.trim()) {
        essay += `Essay Topic: ${prompt}\n\n`;
    }

    const hook = document.getElementById('hook').value.trim();
    const background = document.getElementById('background').value.trim();
    const thesis = document.getElementById('thesis').value.trim();

    if (hook || background || thesis) {
        essay += `${hook} ${background} ${thesis}`.trim() + '\n\n';
    }

    const transition1 = document.getElementById('transition1').value;
    const body1Topic = document.getElementById('body1Topic').value.trim();
    const body1Evidence = document.getElementById('body1Evidence').value.trim();
    const body1Concluding = document.getElementById('body1Concluding').value.trim();

    if (body1Topic || body1Evidence || body1Concluding) {
        essay += `${transition1 ? transition1 + ' ' : ''}${body1Topic} ${body1Evidence} ${body1Concluding}`.trim() + '\n\n';
    }

    const transition2 = document.getElementById('transition2').value;
    const body2Topic = document.getElementById('body2Topic').value.trim();
    const body2Evidence = document.getElementById('body2Evidence').value.trim();
    const body2Concluding = document.getElementById('body2Concluding').value.trim();

    if (body2Topic || body2Evidence || body2Concluding) {
        essay += `${transition2 ? transition2 + ' ' : ''}${body2Topic} ${body2Evidence} ${body2Concluding}`.trim() + '\n\n';
    }

    const transition3 = document.getElementById('transition3').value;
    const body3Topic = document.getElementById('body3Topic').value.trim();
    const body3Evidence = document.getElementById('body3Evidence').value.trim();
    const body3Concluding = document.getElementById('body3Concluding').value.trim();

    if (body3Topic || body3Evidence || body3Concluding) {
        essay += `${transition3 ? transition3 + ' ' : ''}${body3Topic} ${body3Evidence} ${body3Concluding}`.trim() + '\n\n';
    }

    const transitionConc = document.getElementById('transitionConclusion').value;
    const restatedThesis = document.getElementById('restatedThesis').value.trim();
    const summary = document.getElementById('summary').value.trim();
    const closingThought = document.getElementById('closingThought').value.trim();

    if (restatedThesis || summary || closingThought) {
        essay += `${transitionConc ? transitionConc + ' ' : ''}${restatedThesis} ${summary} ${closingThought}`.trim();
    }

    return essay.trim();
}

function previewEssay() {
    const essay = generateEssay();
    if (!essay || essay.startsWith('Essay Topic:') && essay.length < 20) {
        alert('Please write some content before previewing!');
        return;
    }

    const paragraphs = essay.split('\n\n');
    const formattedEssay = paragraphs.map(p => {
        if (p.startsWith('Essay Topic:')) {
            return `<p style="text-indent: 0; font-weight: bold; margin-bottom: 20px;">${p}</p>`;
        }
        return `<p>${p}</p>`;
    }).join('');

    document.getElementById('previewText').innerHTML = formattedEssay;
    document.getElementById('previewModal').style.display = 'block';
}

function closePreview() {
    document.getElementById('previewModal').style.display = 'none';
}

// Announce status to screen readers
function announceStatus(message) {
    const statusElement = document.getElementById('status-announcements');
    if (statusElement) {
        statusElement.textContent = message;
    }
}

function copyEssay() {
    const essay = generateEssay();
    if (!essay || essay.startsWith('Essay Topic:') && essay.length < 20) {
        alert('Please write some content before copying!');
        return;
    }

    navigator.clipboard.writeText(essay).then(() => {
        const btn = document.querySelector('.btn-success');
        const originalText = btn.textContent;
        btn.textContent = '✓ Copied!';
        announceStatus('Essay copied to clipboard');
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    }).catch(() => {
        const textArea = document.createElement('textarea');
        textArea.value = essay;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        const btn = document.querySelector('.btn-success');
        const originalText = btn.textContent;
        btn.textContent = '✓ Copied!';
        announceStatus('Essay copied to clipboard');
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Setup input event listeners
    document.getElementById('hook').addEventListener('input', checkHook);
    document.getElementById('thesis').addEventListener('input', checkThesis);
    document.getElementById('body1Topic').addEventListener('input', () => checkTopicSentence('body1Topic', 'body1TopicFeedback'));
    document.getElementById('body2Topic').addEventListener('input', () => checkTopicSentence('body2Topic', 'body2TopicFeedback'));
    document.getElementById('body3Topic').addEventListener('input', () => checkTopicSentence('body3Topic', 'body3TopicFeedback'));
    document.getElementById('restatedThesis').addEventListener('input', checkConclusion);

    const sections = [
        { ids: ['hook', 'background', 'thesis'], counter: 'introWordCount' },
        { ids: ['body1Topic', 'body1Evidence', 'body1Concluding'], counter: 'body1WordCount' },
        { ids: ['body2Topic', 'body2Evidence', 'body2Concluding'], counter: 'body2WordCount' },
        { ids: ['body3Topic', 'body3Evidence', 'body3Concluding'], counter: 'body3WordCount' },
        { ids: ['restatedThesis', 'summary', 'closingThought'], counter: 'conclusionWordCount' }
    ];

    sections.forEach(section => {
        section.ids.forEach(id => {
            const elem = document.getElementById(id);
            if (elem) {
                elem.addEventListener('input', () => updateWordCount(section.ids, section.counter));
            }
        });
    });

    // Setup button event listeners
    const clearBtn = document.querySelector('.actions .btn-secondary');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearAll);
    }

    const previewBtn = document.querySelector('.actions .btn-primary');
    if (previewBtn) {
        previewBtn.addEventListener('click', previewEssay);
    }

    const copyBtn = document.querySelector('.actions .btn-success');
    if (copyBtn) {
        copyBtn.addEventListener('click', copyEssay);
    }

    // Setup modal close functionality
    const modal = document.getElementById('previewModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                closePreview();
            }
        });
        
        const closeBtn = modal.querySelector('.btn-secondary');
        if (closeBtn) {
            closeBtn.addEventListener('click', closePreview);
        }
    }

    // Language Arts return button injection
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

// Make sections available globally for clearAll function
let sections = [
    { ids: ['hook', 'background', 'thesis'], counter: 'introWordCount' },
    { ids: ['body1Topic', 'body1Evidence', 'body1Concluding'], counter: 'body1WordCount' },
    { ids: ['body2Topic', 'body2Evidence', 'body2Concluding'], counter: 'body2WordCount' },
    { ids: ['body3Topic', 'body3Evidence', 'body3Concluding'], counter: 'body3WordCount' },
    { ids: ['restatedThesis', 'summary', 'closingThought'], counter: 'conclusionWordCount' }
];
