'use strict';
/* Chatting with the people on the trail (build 2.6).
   Walk up to a hiker or a stall keeper and press Enter: they stop and turn to you. Type (Hindi, English or Hinglish)
   and press Enter; their answer shows as a subtitle while they talk with their hands. Everyone is somebody: a name,
   a home town, a reason to be on the mountain, going up or down, where they stand and what time it is. Each person
   remembers what you said to them.
   Real conversation runs on the trek server (../server, POST /bot/chat, Claude). Without the server, or without a
   Claude key on it, they still answer with short everyday lines.
   Interface: create(ctx) -> { prompt(P), open(), busy, personaOf(a) }   ctx: { crowd(), me(), playing(), scene(person, doing), say, toast } */
window.TriundTalk = {
  create(ctx) {
    const QS = new URLSearchParams(location.search);
    const BASE = (() => {
      const s = QS.get('server') || (() => { try { return localStorage.getItem('triund-server') || ''; } catch (e) { return ''; } })();
      if (s) return s.replace(/^ws/, 'http').replace(/\/ws$|\/triund-ws$/, '');
      return location.port === '8765' ? 'http://' + location.hostname + ':8787' : location.origin && location.origin !== 'null' ? location.origin : 'http://127.0.0.1:8787';
    })();

    /* ---------- who they are (fixed for each person, from their id) ---------- */
    const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
    const pick = (arr, h, k) => arr[(h >>> (k * 3)) % arr.length];
    const NAMES = { m: ['Rohit', 'Arjun', 'Karan', 'Aman', 'Siddharth', 'Vikram', 'Rahul', 'Nikhil', 'Harsh', 'Aditya', 'Manish', 'Tenzin', 'Gurpreet', 'Abhishek', 'Varun'],
      f: ['Priya', 'Ananya', 'Sneha', 'Neha', 'Riya', 'Kavya', 'Simran', 'Pooja', 'Ishita', 'Megha', 'Tanvi', 'Aditi', 'Pema'] };
    const HOMES = ['Delhi', 'Chandigarh', 'Pune', 'Bengaluru', 'Mumbai', 'Ludhiana', 'Jaipur', 'Kolkata', 'Dehradun', 'Gurugram', 'Lucknow', 'Ahmedabad', 'Hyderabad', 'Amritsar', 'Shimla'];
    const WHO = ['an IT engineer on a long weekend with three college friends', 'a college student on a trip with the hostel gang',
      'on your first ever trek, a little nervous but loving it', 'a solo backpacker who has been in McLeod Ganj for two weeks',
      'here with your partner, it was their idea', 'a photographer chasing the sunset from the top', 'a school teacher on a winter break with your cousins',
      'a regular who comes up Triund every year', 'a startup founder trying to switch off your phone for a day', 'camping on the top tonight with friends'];
    const KEEPER_NAMES = { m: ['Raju', 'Sanjay', 'Om Prakash', 'Ramesh', 'Kishan', 'Bittu'], f: ['Kamla', 'Sunita', 'Rekha'] };
    const VILLAGES = ['Dharamkot', 'Naddi', 'Bhagsu', 'Gallu', 'Jogiwara'];
    const personas = new Map();
    function personaOf(a) {
      const id = a.id || 'p'; if (personas.has(id)) return personas.get(id);
      const h = hash(id), sex = a.look && a.look.sex === 'f' ? 'f' : 'm', keeper = a.kind === 'keeper';
      const p = keeper ? { name: pick(KEEPER_NAMES[sex], h, 1), sex, age: 35 + (h % 25), home: pick(VILLAGES, h, 2), role: 'keeper', who: '' }
        : { name: pick(NAMES[sex], h, 1), sex, age: 19 + (h % 22), home: pick(HOMES, h, 2), role: 'hiker', who: pick(WHO, h, 4) };
      p.history = []; personas.set(id, p); return p;
    }
    function doing(a) {
      if (a.kind === 'keeper') return 'standing at your stall counter';
      if (a.state === 'sit') return 'sitting at a chai stall having a break';
      if (a.state === 'fire') return 'sitting by a campfire on the top';
      if (a.state === 'top') return 'on the Triund top meadow';
      if (a.state === 'rest') return 'resting by the path';
      return a.dir > 0 ? 'walking up toward Triund' : 'walking down after the top';
    }

    /* ---------- without the server's AI: they still answer what you asked, from what they know ----------
       Each line is matched to what it asks (how far, which way, chai, the weather, who they are…) and answered from the
       real place, time and their own story, in Hinglish or English as you typed. If it is not something they
       understand, they say so and tell you what you can ask: they never answer something you did not ask. */
    const HINGLISH = /[ऀ-ॿ]|\b(kya|hai|hain|kitna|kitni|kitne|kaise|kaisi|kahan|kaha|kidhar|kab|bhai|yaar|ji|aap|tum|tu|mera|meri|kaun|kyu|kyun|nahi|nhi|haan|accha|acha|chalo|karo|karte|karti|ho|hu|hoon|se|ko|ka|ki|ke|mein|bata|batao|milega|milegi|lagega|wala|wali|abhi|bahut|bohot|thoda|raasta|rasta)\b/;
    const placeHi = pl => pl.replace(/^at (.+)$/, '$1 pe').replace(/^on the path, about (\d+) m from (.+)$/, '$2 se lagbhag $1 m door, raste pe').replace(/^on the trail$/, 'trail pe');
    const WHO_HI = {
      'an IT engineer on a long weekend with three college friends': 'IT me kaam karta hoon, college ke teen dost ke saath long weekend pe aaye hain',
      'a college student on a trip with the hostel gang': 'college me hoon, hostel ki gang ke saath trip pe aaye hain',
      'on your first ever trek, a little nervous but loving it': 'mera pehla trek hai, thoda darr bhi hai par maza aa raha hai',
      'a solo backpacker who has been in McLeod Ganj for two weeks': 'akela ghoom raha hoon, do hafte se McLeod Ganj me hoon',
      'here with your partner, it was their idea': 'partner ke saath aaya hoon, plan unka tha',
      'a photographer chasing the sunset from the top': 'photographer hoon, upar se sunset shoot karna hai',
      'a school teacher on a winter break with your cousins': 'teacher hoon, winter break me cousins ke saath aaye hain',
      'a regular who comes up Triund every year': 'har saal Triund aata hoon, ab toh ghar jaisa lagta hai',
      'a startup founder trying to switch off your phone for a day': 'startup chalata hoon, ek din phone se door rehne aaya hoon',
      'camping on the top tonight with friends': 'aaj raat doston ke saath top pe camp kar rahe hain' };
    function wxWords(w, hour) {
      w = String(w || '').toLowerCase();
      if (hour >= 18 || hour < 6) return ['raat hai, thand bahut hai', 'night now, and very cold'];
      if (/snow/.test(w)) return ['upar halki barf gir rahi hai', 'light snow up high'];
      if (/mist/.test(w)) return ['ghaati se dhundh upar aa rahi hai', 'mist is coming up from the valley'];
      if (/cloud/.test(w)) return ['baadal aa gaye hain', 'it is cloudy'];
      return ['dhoop hai, mausam saaf hai', 'clear and sunny'];
    }
    function offline(p, said, sc) {
      const t = ' ' + said.toLowerCase().replace(/[?!.,]+/g, ' ').replace(/\s+/g, ' ') + ' ';
      const en = !HINGLISH.test(t) && / (the|is|are|was|what|where|how|who|why|when|which|you|your|i|i m|am|do|does|did|can|could|will|would|there|this|that|it|my|me|we|any|much|many|far|long) /.test(t);
      const say = (hi, e) => en ? e : hi, K = p.role === 'keeper', km = sc.to_top_km, hour = parseInt(sc.clock, 10) || 10;
      const top = /top meadow|campfire/.test(sc.doing) || (km != null && km < 0.15), down = /down/.test(sc.doing);
      const has = re => re.test(t);
      if (has(/ (thank|thanks|thx|ty|shukriya|shukria|dhanyavad|dhanyawad) /)) return say('Arre koi baat nahi! Aaram se jaana.', 'No problem at all! Take it easy.');
      if (has(/ (bye|tata|alvida|see you|good night|chalta hu|chalti hu|milte hai|milte hain) /)) return say('Chalo, milte hain upar! Dhyan se.', 'See you up there! Go carefully.');
      if (has(/ (bot|ai|robot|npc|insaan ho|real ho|asli ho) /)) return say('Haha, main toh asli thaka hua trekker hoon!', 'Ha, I am a very real, very tired trekker!');
      if (has(/ (kaise ho|kaisi ho|kya haal|kaisa hai|how are you|how r u|sab theek|all good|whats up|what s up) /))
        return K ? say('Badhiya ji! Aaj bheed thodi zyada hai. Chai piyoge?', 'All good! Busy day today. Some chai?') : say(`Badhiya! ${down ? 'Ghutne bol rahe hain' : 'Saans phool rahi hai'} par mast hai. Aap?`, `Good! ${down ? 'Knees are complaining' : 'A bit out of breath'}, but loving it. You?`);
      if (has(/ (naam|name) /)) return say(`Main ${p.name}. Aapka?`, `I'm ${p.name}. And you?`);
      if (has(/ (kahan se|kaha se|kidhar se|where are you from|where r u from|from where|rehte|rehti) /))
        return K ? say(`${p.home} se hoon, neeche wala gaon. Roz subah upar aata hoon.`, `From ${p.home}, the village below. I walk up every morning.`) : say(`${p.home} se. Aap kahan se ho?`, `From ${p.home}. Where are you from?`);
      if (has(/ (kya karte|kya karti|kaam kya|what do you do|job|profession|kaun ho|who are you|kis ke saath|kiske sath|with whom|akele ho|alone) /))
        return K ? say(`${p.home} me rehta hoon, bees saal se yahi chai ki dukaan chala raha hoon.`, `I live in ${p.home} and have run this chai stall for twenty years.`) : say(`Main ${p.home} se, ${WHO_HI[p.who] || 'trek pe aaya hoon'}.`, `I'm from ${p.home}, ${p.who.replace(/\byour\b/g, 'my')}.`);
      if (has(/ (kitna door|kitna dur|kitni door|kitni dur|kitna time|kitna samay|kitna waqt|kitni der|how far|how long|kab tak|top kab|kitna bacha|kitna aur|kitne km|km) /)) {
        if (top) return say('Hum top pe hi hain! Ab bas view dekho.', 'We are on the top already! Just enjoy the view.');
        if (km == null) return say('Top ka pakka nahi pata, par trail ke saath chalte raho.', 'Not sure exactly, just keep following the trail.');
        const h = km / 1.6, ht = h < 0.75 ? `${Math.max(15, Math.round(h * 60 / 5) * 5)} minute` : `${Math.round(h * 2) / 2} ghanta`;
        return say(`Top abhi lagbhag ${km.toFixed(1)} km hai, aaram se ${ht} aur.${km < 2.6 && km > 0.4 ? ' Aage 22 curves hain, steep hai.' : ''}`, `About ${km.toFixed(1)} km to the top, ${h < 0.75 ? Math.max(15, Math.round(h * 60 / 5) * 5) + ' minutes' : Math.round(h * 2) / 2 + ' hours'} at an easy pace.${km < 2.6 && km > 0.4 ? ' The 22 curves are ahead, it gets steep.' : ''}`);
      }
      if (has(/ (kahan hai hum|kahan hain hum|kahan hu|kahan hoon|ye kaun si jagah|yeh kaun si jagah|kaunsi jagah|ye jagah|where are we|where is this|what place|location) /))
        return say(`Abhi hum ${placeHi(sc.place)} hain, ${sc.alt} m pe.`, `We are ${sc.place}, at ${sc.alt} m.`);
      if (has(/ (height|altitude|unchai|kitne meter|elevation|kitna upar) /)) return say(`Yahan lagbhag ${sc.alt} m hai. Top 2,838 m pe hai.`, `About ${sc.alt} m here. The top is at 2,838 m.`);
      if (has(/ (time kya|kitne baje|what time|sunset|suraj|andhera|dark|raat kab) /))
        return say(`Abhi ${sc.clock} baje hain. Sunset 5:25 ke aas paas, ${hour >= 15 ? 'torch nikaal ke rakhna, jaldi andhera hoga.' : 'abhi time hai.'}`, `It's ${sc.clock}. Sunset is around 5:25, ${hour >= 15 ? 'keep your torch handy, it gets dark fast.' : 'there is still time.'}`);
      if (has(/ (mausam|weather|thand|cold|snow|barf|baarish|rain|dhoop|sardi|garmi|hot|clouds|badal) /))
        { const [wh, we] = wxWords(sc.weather, hour);
          return say(`Abhi ${wh}. ${hour < 12 ? 'Dopahar tak baadal aa jaate hain, upar' : 'Upar'} thand bahut hai, jacket rakhna.`, `Right now ${we}. ${hour < 12 ? 'Clouds build up by midday, and it' : 'It'}'s cold on top, keep a jacket.`); }
      if (has(/ (kitne ka|kitne ki|kitne ke|price|rate|kitna paisa|kitne paise|menu|kya milega|kya kya hai|kya hai khane) /))
        return K ? say('Chai, Maggi, lemon tea, biscuit sab hai. Rate counter pe likha hai, E dabao, menu dikha deta hoon.', 'Chai, Maggi, lemon tea, biscuits. Prices are on the counter, press E for the menu.') : say('Upar jitna jaoge utna mehenga, sab khachchar se aata hai na. Counter pe rate likha hota hai.', 'The higher you go, the pricier it gets, everything comes up by mule. Prices are on each counter.');
      if (has(/ (chai|tea|maggi|khana|food|paani|pani|water|bhook|pyaas|thirsty|hungry|eat|drink|nashta|cafe|dukaan|shop) /))
        return K ? say('Haan ji, garam chai aur Maggi ready hai. Baitho, E dabao, order le leta hoon.', 'Yes, hot chai and Maggi are ready. Have a seat and press E to order.') : say(sc.place.startsWith('at ') ? 'Yahin chai pi lo, aage Magic View tak kuch kam hai.' : 'Magic View Cafe pe ruk jana, wahan ki chai mast hai. Paani bhi bhar lena.', sc.place.startsWith('at ') ? 'Have a chai right here, there is not much till Magic View.' : 'Stop at Magic View Cafe, great chai there. Fill your water too.');
      if (has(/ (camp|camping|tent|raat|ruk|rukna|rukne|ruke|stay|night|sona|sleep|bonfire) /))
        return say('Top pe tent mil jaate hain, raat ko bonfire aur taare kamaal ke hote hain. Bas thand bahut hoti hai.', 'You can hire a tent on the top; the bonfire and the stars are amazing at night. It gets very cold though.');
      if (has(/ (snowline|snow line|laka|indrahar|aage kya|beyond) /))
        return say('Triund se 2 km aage Snowline Cafe hai, 3,170 m. Laka aur Indrahar uske bhi aage, experienced logon ke liye.', 'Snowline Cafe is 2 km beyond Triund, at 3,170 m. Laka and Indrahar Pass are further, for experienced trekkers.');
      if (has(/ (check post|checkpost|fee|ticket|permit|entry|register|id card) /))
        return say('Gallu pe forest check post hai, 100 rupaye entry, naam register me likhte hain. 11:30 ke baad entry band.', 'The forest check post at Gallu takes Rs 100 and writes your name in the register. Entry closes at 11:30.');
      if (has(/ (rasta|raasta|way|route|kidhar|which way|left|right|path|trail|shortcut|curves) /))
        return say(top ? 'Neeche jaane ke do raste: Gallu wala aasaan, Bhagsu wala steep hai.' : 'Bas pattharon wale trail pe chalte raho, galat nahi hoga. Shortcut steep hote hain, thak jaoge.', top ? 'Two ways down: via Gallu is easier, via Bhagsu is steep.' : 'Just follow the stone trail, you cannot go wrong. The shortcuts are steep and tiring.');
      if (has(/ (toilet|washroom|bathroom|loo|susu|peshab) /)) return say('Top pe camps ke paas toilet hai. Raste me bas jungle hai, dhyan se.', 'There are toilets near the camps on the top. On the way it is just forest.');
      if (has(/ (dog|kutta|kutte|doggy) /)) return say('Haha, ye pahadi kutte bahut friendly hain, top tak saath chal dete hain.', 'Ha, these mountain dogs are friendly, they walk with you all the way up.');
      if (has(/ (mandir|temple|hanuman|bajrang|galu devi|gallu devi|jhande) /)) return say('Gallu Devi mandir neeche start pe hai, aur top ke kinare Hanuman ji ki murti hai. Darshan zaroor karna.', 'Gallu Devi temple is at the start, and there is a Hanuman murti on a rock at the edge of the top.');
      if (has(/ (waterfall|jharna|bhagsu|shiva cafe) /)) return say('Bhagsu wale raste pe waterfall aur Shiva Cafe aate hain. Woh rasta steep hai par bahut sundar.', 'The Bhagsu path passes the waterfall and Shiva Cafe. Steeper, but beautiful.');
      if (has(/ (thak|tired|saans|breath|rest|aaram|exhausted|pair dard|legs) /) || sc.player_tired && has(/ (help|ruk) /)) return say('Thoda baith jao, paani piyo. Pahad kahin nahi bhaag raha.', 'Sit for a bit and drink some water. The mountain is not going anywhere.');
      if (has(/ (help|madad|lost|kho gaya|kho gayi|darr|dar lag|scared|safe|khatra|danger|chot|injur|akeli|akela) /))
        return say(`Ghabrao mat, trail pe log hain. Andhere se pehle neeche aa jana${hour >= 15 ? ', aur torch on rakhna' : ''}. Kuch chahiye toh batao.`, `Don't worry, there are people on the trail. Be down before dark${hour >= 15 ? ' and keep your torch on' : ''}. Tell me if you need anything.`);
      if (has(/ (photo|selfie|picture|pic|click) /)) return say('Haan haan! P dabao, selfie le lo. Top pe view aur bhi mast hai.', 'Sure! Press P for a selfie. The view from the top is even better.');
      if (has(/^ (hi+|hello|hey|hlo|helo|namaste|namaskar|ram ram|jai|radhe radhe|sat sri akal|salaam|good morning|good evening) /))
        return K ? say('Namaste ji! Aao, chai piyoge?', 'Namaste! Come, have some chai?') : say(`Namaste! ${top ? 'Pahunch gaye aap bhi!' : down ? 'Upar se aa rahe hain, mast tha.' : 'Upar ja rahe ho?'}`, `Hello! ${top ? 'You made it too!' : down ? 'Just coming down, it was great up there.' : 'Heading up?'}`);
      if (has(/^ (ok|okay|haan|han|ha|accha|acha|thik|theek|hmm+|sahi|cool|nice|wow|mast|great) /)) return say('Chalo phir! Milte hain upar.', 'Alright then! See you up there.');
      // not something they understood: they say so (and what you could ask) rather than make something up
      return say('Sorry, samjha nahi. Trek ke baare me poocho: kitna door hai, chai kahan milegi, mausam, rasta, camp…', "Sorry, I didn't get that. Ask me about the trek: how far, where to get chai, the weather, the way, camping…");
    }

    /* ---------- the chat line: Enter to open, type, Enter to send ---------- */
    const css = document.createElement('style');
    css.textContent = `#talkBox{position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:13;width:min(560px,90vw);display:flex;gap:8px;align-items:center;background:rgba(13,22,19,.86);border:1px solid rgba(255,255,255,.2);border-radius:14px;padding:8px 10px}
#talkBox[hidden]{display:none}#talkBox b{font:700 15px var(--f-display,sans-serif);color:#f2c230;white-space:nowrap}
#talkBox input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:#f1ead8;font:16px Hind,sans-serif}
#talkBox button{border:1px solid rgba(255,255,255,.25);background:transparent;color:#f1ead8;border-radius:10px;padding:6px 10px;font:700 14px var(--f-display,sans-serif)}
#talkBox button.send{background:#f2c230;color:#2a1a04;border-color:#f2c230}`;
    document.head.appendChild(css);
    const box = document.createElement('div'); box.id = 'talkBox'; box.hidden = true;
    box.innerHTML = '<b></b><input id="talkIn" type="text" maxlength="300" autocomplete="off" spellcheck="false" enterkeyhint="send"><button type="button" class="send">Send</button><button type="button" class="x" aria-label="Close">✕</button>';
    document.body.appendChild(box);
    const input = box.querySelector('input');
    let who = null, waiting = false, warned = false;
    function open() {
      const crowd = ctx.crowd(), P = ctx.me(); if (!crowd || !P || waiting) return false;
      const a = crowd.nearestPerson(P, 3.4); if (!a) return false;
      who = a; const p = personaOf(a); crowd.chat(a, 60, 0);
      box.querySelector('b').textContent = (p.history.length ? p.name : a.kind === 'keeper' ? 'Stall keeper' : 'Hiker') + ':';
      input.placeholder = 'Say something… (Enter to send, Enter on an empty line to close)';
      input.value = ''; box.hidden = false; input.focus(); return true;
    }
    function close() { box.hidden = true; input.blur(); if (who && ctx.crowd()) ctx.crowd().chat(who, 6, 0); }
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Enter') return;
      e.preventDefault(); const text = input.value.trim(); close(); if (text && who) send(who, text);
    });
    input.addEventListener('keyup', e => e.stopPropagation());
    // touch screens: Send and ✕ (the phone keyboard's send key works too)
    box.querySelector('.send').addEventListener('click', () => { const text = input.value.trim(); close(); if (text && who) send(who, text); });
    box.querySelector('.x').addEventListener('click', () => close());
    async function send(a, said) {
      const p = personaOf(a), sc = ctx.scene(a, doing(a)); waiting = true;
      ctx.toast('You: ' + said.slice(0, 90)); ctx.say(`${p.name}: …`, 20); ctx.crowd().chat(a, 30, 0);
      let reply = null;
      try {
        const res = await fetch(BASE + '/bot/chat', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: said, persona: { name: p.name, sex: p.sex, age: p.age, home: p.home, role: p.role, who: p.who }, scene: sc, history: p.history.slice(-8) }) });
        const d = await res.json().catch(() => null);
        if (res.ok && d && d.reply) reply = d.reply;
        else if (res.status === 429 && d) ctx.toast(d.error);
      } catch (e) { /* no server: fall back below */ }
      if (!reply) {
        reply = offline(p, said, sc);
        if (!warned) { warned = true; setTimeout(() => ctx.toast('They understand trek questions; to chat about anything, the server needs a Claude key'), 2600); }
      }
      waiting = false;
      p.history.push({ who: 'me', text: said }, { who: 'them', text: reply });
      if (p.history.length > 16) p.history.splice(0, p.history.length - 16);
      const dur = Math.min(9, Math.max(3, reply.length / 14));
      ctx.crowd().chat(a, dur + 15, dur); ctx.say(`${p.name}: ${reply}`, dur + 2);
    }
    window.addEventListener('keydown', e => { if (e.code === 'Enter' && !e.repeat && box.hidden && ctx.playing() && open()) e.preventDefault(); });

    return {
      get busy() { return waiting || !box.hidden; },
      base: BASE,
      prompt(P) {
        if (!box.hidden || waiting) return null;
        const c = ctx.crowd(); const a = c && c.nearestPerson(P, 3.4); if (!a) return null;
        const p = personas.get(a.id);
        return `<kbd>${document.body.classList.contains('touchmode') ? 'Talk' : 'Enter'}</kbd> Talk to ${p && p.history.length ? p.name : a.kind === 'keeper' ? 'the stall keeper' : 'the hiker'}`;
      },
      open, personaOf,
      qaOffline: (p, said, sc) => offline(p, said, sc),   // QA: the answer without the server's AI
      // QA: say a line to the nearest person
      qaSay(text) { const c = ctx.crowd(), a = c && c.nearestPerson(ctx.me(), 3.4); if (!a) return false; send(a, text); return true; }
    };
  }
};
