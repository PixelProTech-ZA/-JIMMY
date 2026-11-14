/* Jimmy's voice. Deadpan, overworked, a bit South African. Shuffle-bag: no line repeats until its whole category has been used. */
(function () {
'use strict';
const L = {
  greet: [
    "Jimmy. Filing since before filing was cool. Drop something on the tray.",
    "Morning. Or afternoon. I have no windows, so I'll take your word for it.",
    "Tray's empty. My favourite state and my least productive one.",
    "Ready. Running on brass, spite and a little bit of oil.",
    "Bring me paperwork. I'll bring you less paperwork.",
    "Another day at the office. They never gave me a lunch break either.",
    "Six jobs, one stapler. Ask me anything office-shaped.",
    "Don't be shy. Everything is read right here on your device. I can't gossip, I have no phone."
  ],
  late: ["It's {time}. Either you're dedicated or the deadline is.", "{time}. Nobody should be filing at this hour. Let's do it anyway."],
  friday: ["Friday after four. I'll work, but I'll resent it quietly.", "Friday afternoon. Technically I'm already at the braai."],
  monday: ["Monday. We don't talk about Monday, we just process it."],
  weekend: ["Weekend. Both of us are here. Neither of us should be. Fine, go."],
  fetch: [
    "On it.",
    "Grabbing it. Mind the paper cuts, they're mostly mine.",
    "Sprinting. Well. Brisk clanking.",
    "Got it. It's warm. Somebody was holding this nervously.",
    "Fetching. This is cardio for brass.",
    "Ooh, a {ext}. My favourite. I say that to all of them.",
    "Right, tray to machine. A journey of about two metres.",
    "Don't watch me. I get self-conscious on carry runs.",
    "Lifting with my knees. I don't have knees. Lifting with spite.",
    "One document, coming through. Hot paper, mind your feet.",
    "I'd say 'just now', but I mean now. Properly now.",
    "Walking briskly. Running is for people with calves."
  ],
  process: [
    "Machine's chewing. Don't tap the glass.",
    "Reading every line. Yes, even the boring ones. Especially the boring ones.",
    "Found a footnote. It's lonely. I'm keeping it company.",
    "Crunching. It sounds worse than it is.",
    "If this were load shedding I'd be crying. It's not. We're fine.",
    "Counting commas. Somebody has to.",
    "Whoever formatted this had a vision. Not a good one, but a vision.",
    "Cogs spinning. Nobody stuck in a meeting. Progress.",
    "This is the bit where I look busy. Except I'm actually busy.",
    "Almost. Real almost, not 'just now' almost.",
    "I've seen things in PDFs. Margins that lie. Fonts that shouldn't exist.",
    "Mm-hm. Yes. Mm. That's the sound of a machine thinking. Mostly.",
    "Gears turning, zero emails sent. A good day.",
    "Don't blink. Actually blink, it's fine, I'm fast."
  ],
  deliver: [
    "Done. Take it before I get attached.",
    "Hot off the machine. Careful, it's only warm, not cooked.",
    "One {job}, as ordered. No tip required. Tips encouraged.",
    "There. If it's wrong it's the file's fault. If it's right I did it.",
    "Handing over. This is the best part of my day. The rest of my day is also this.",
    "{s} seconds. A human would still be looking for the stapler.",
    "Done and dusted. I don't dust. Figure of speech.",
    "Ta-da. Applause not included, but accepted.",
    "Here you go. I'd wipe my hands but they're brass.",
    "Finished. Quicker than a Home Affairs queue. Low bar, I know.",
    "Sorted. You may now tell the boss it was your idea.",
    "Another one for the folder. I don't have a folder. I am the folder.",
    "Paperwork. Defeated. Temporarily.",
    "That's you. Next victim?"
  ],
  big: ["{n} pages. Bold of you.", "{n} pages. I'm going to need a minute and a chair.", "{n} pages and not one of them is a joke. I checked."],
  one: ["One page. Is this a joke? It's a good joke."],
  crowd: ["{k} files. You've sent me a whole department.", "{k} files at once. I'm flattered and slightly terrified."],
  streak3: ["That's job number {k}. You're keeping me busy."],
  streak5: ["{k} in a row. I'll expect a raise in exposure."],
  streak10: ["{k} jobs. I'm not saying I'm tired, I'm saying I'm made of friction."],
  fail_scan: [
    "This is a scan. A picture of words, not words. I can't read pictures yet. OCR isn't in my toolbox.",
    "No text in here. Someone scanned it and called it a day. I'd need OCR and I haven't got it yet.",
    "Pretty page. Zero characters. Scanned PDFs make me weep rust."
  ],
  fail_ocr: ["That's a picture. I read text, not photos. OCR isn't in this version of me.", "A photo. I can't read photos yet. Give me the original document."],
  fail_corrupt: [
    "This file is dead. I tried CPR. Nothing.",
    "I opened it and it opened me back. Corrupt. Try the original.",
    "Whatever this is, it's not what its name says. Fraud."
  ],
  fail_locked: ["It's password-protected. I'm brass, not a locksmith. Unlock it first.", "Locked. I respect privacy more than I respect deadlines."],
  fail_empty: ["You gave me nothing. Bit like my pension.", "Empty file. Zero bytes. A real minimalist."],
  fail_toofew: ["Merge needs two or more files. One file can't merge with itself, that's just a mood.", "A merge of one is just a file. Add more."],
  fail_badtype: ["I can't do this job on a {ext}. I'm brass, not magic.", "Wrong kind of file for this one. Try something else on the tray."],
  fail_notray: ["The tray is empty. I can't process the idea of a file.", "Nothing in the tray. Drop something on the tray or press 'add files'."],
  fail_unknown: [
    "I know six things: extract, tables, merge, split, sort, invoice. That wasn't one of them.",
    "Didn't catch that. Try 'extract', 'tables', 'merge', 'split 3-7', 'sort' or 'invoice for Acme R1500'."
  ],
  fail_notables: ["Looked everywhere. No tables. Just paragraphs pretending to be organised.", "Zero tables. I checked behind the paragraphs too."],
  fail_badrange: ["Pages {range}? This document has {n}. I'm good, I'm not that good.", "That page range doesn't exist. Not even in my imagination."],
  fail_onepage: ["{name} has one page. There's nothing to split. It's already as small as it gets."],
  fail_noclient: ["Who's it for? An invoice with no name is just a rude number."],
  fail_noitems: ["No line items. I can't invoice for vibes."],
  fail_generic: ["That went sideways. Technical term. Try again, or try the original file."],
  busy: ["One job at a time. I've only got two hands and one of them is holding a pen.", "Hold on, I'm mid-walk. Patience is a tool too."],
  poke: ["Don't poke the clerk.", "Careful. I'm brass but I have feelings. Small ones.", "I'm working. Okay, I'm standing. Standing is part of working."],
  idle: [
    "Polishing a cog. Don't mind me.",
    "I could alphabetise your life. Just say 'sort'.",
    "Still here. Still brass.",
    "Foolscap paper still lurks in every office drawer in South Africa. So do I.",
    "Somewhere a printer is jamming. I felt it.",
    "Quiet in here. I could process a rumour. Not that I would.",
    "That sound is nobody emailing you. Cherish it.",
    "Try 'invoice for Acme R1500'. I'm fast with money. Other people's money.",
    "Drop a stack of files and say 'sort'. I'll find the duplicates too."
  ],
  help: ["I do six things: extract text, pull tables, merge PDFs, split PDFs, sort files (and hunt duplicates), and write invoices or quotes. Drop files on the tray, then tell me which."],
  thanks: ["Don't thank me, thank the cogs.", "Anytime. That's not a promise, it's just my schedule."],
  hello: ["Jimmy at your service. Mostly. Occasionally at my own."]
};

// Office mode: short, dry, no jokes.
const O = {
  greet: ["Ready."], fetch: ["Fetching."], process: ["Working."], deliver: ["Done."], idle: [],
  fail_scan: ["No text layer. Scanned document. OCR not available."],
  fail_ocr: ["Image file. OCR not available."],
  fail_corrupt: ["File is corrupt or not what its name says."],
  fail_locked: ["File is password-protected."],
  fail_empty: ["File is empty."],
  fail_toofew: ["Merge needs two or more files."],
  fail_badtype: ["Unsupported file type: {ext}."],
  fail_notray: ["Tray is empty."],
  fail_unknown: ["Unknown command. Try: extract, tables, merge, split, sort, invoice."],
  fail_notables: ["No tables found."],
  fail_badrange: ["Page range {range} is outside 1-{n}."],
  fail_onepage: ["{name} has one page."],
  fail_noclient: ["Client name required."],
  fail_noitems: ["No line items."],
  fail_generic: ["Job failed."],
  busy: ["Busy."], poke: ["Working."], help: ["Jobs: extract, tables, merge, split, sort, invoice."], thanks: ["OK."], hello: ["Ready."]
};

const bags = {};
function fill(s, ctx) {
  return s.replace(/\{(\w+)\}/g, (m, k) => (ctx && ctx[k] != null) ? ctx[k] : m.replace(/[{}]/g, ''));
}
function pick(cat, ctx, office) {
  const src = office ? (O[cat] && O[cat].length ? O[cat] : (O[cat] ? [] : null)) : L[cat];
  const pool = src || (office ? O.fail_generic : L.fail_generic);
  if (!pool.length) return '';
  const key = (office ? 'o:' : 'j:') + cat;
  let bag = bags[key];
  if (!bag || !bag.length) {
    bag = pool.map((_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    if (bags[key + ':last'] != null && bag.length > 1 && bag[bag.length - 1] === bags[key + ':last']) bag.unshift(bag.pop());
    bags[key] = bag;
  }
  const i = bag.pop(); bags[key + ':last'] = i;
  return fill(pool[i], ctx);
}
function count() { let n = 0; for (const k in L) n += L[k].length; return n; }

window.JimmyLines = { pick, count };
})();
