const root = document.querySelector('#app');
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
const careerReadingUrl = 'https://www.twmakers.com.tw/web/learn/highschool.jsp#learnId';
const careerGuideUrl = 'https://friendlycampus.k12ea.gov.tw/Career/21/1';
const radarAxes = ['社會語文','專業知能','身體機能','數理邏輯','溝通合作','心理抗壓'];
const radarPrompts = [
  '要讀懂資料、寫紀錄，或向人清楚說明嗎？',
  '要運用專門工具、流程或領域知識嗎？',
  '要控制動作、穩定操作工具或長時間活動嗎？',
  '要量測、計算、比對數據或排查原因嗎？',
  '要共同分工、交接或確認彼此的意思嗎？',
  '遇到失誤、時間壓力或突發狀況時，需要調整做法嗎？'
];
const profileFields = [['keywords','關鍵字'],['courses','科系（技高科別）'],['careers','未來職人潛力股']];
const stages = ['科別圖鑑','守關挑戰','最後反思｜成果卡'];
const key = (g, s) => 'hunt_' + g + '_' + s;
const milestones = data.flatMap((_,g) => stages.map((_,s) => key(g,s)));
const bossSprite = (group, classes = '') => `<img class="boss-sprite ${classes}" src="art/boss-${group}.webp" alt="" width="240" height="240">`;
let role = '', cls = '', seat = 0, demo = false, uid = '', locks = {}, records = {}, mine = {};
let session, listeners = [], screen = 'home', active = -1, feedback = '', busy = false, fight = false;
let connected = null;
const progress = (g,s) => mine[key(g,s)] || {};
const isOpen = (g,s) => locks[key(g,s)] === true;
const countWins = p => data.filter((_,g) => p[key(g,1)]?.done).length;
const bind = (id, handler) => { if ($(id)) $(id).onclick = handler; };
const stop = () => { listeners.forEach(fn => fn()); listeners = []; };
const status = message => { const target = $('status'); if (target) target.textContent = message; };
const validClass = value => /^[1-9]\d{2}$/.test(value);
function padlet(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && (url.hostname === 'padlet.com' || url.hostname.endsWith('.padlet.com')) &&
        !url.username && !url.password && url.pathname.length > 1) return url.href;
  } catch {}
  return '';
}
async function connect() {
  if (!connected) connected = Promise.all(['app','auth','database'].map(part =>
    import('https://www.gstatic.com/firebasejs/11.10.0/firebase-' + part + '.js')
  )).then(async ([app, auth, database]) => {
    const instance = app.initializeApp(firebaseConfig);
    const instanceAuth = auth.getAuth(instance);
    await instanceAuth.authStateReady();
    return {...auth, ...database, auth: instanceAuth, db: database.getDatabase(instance)};
  }).catch(error => { connected = null; throw error; });
  return connected;
}
const dbref = path => session.ref(session.db, path);
function render(next = screen) {
  const changedScreen = next !== screen;
  screen = next;
  ({home, map, group, report, admin})[screen]();
  if (changedScreen) window.scrollTo(0,0);
}
function nav(label = '返回地圖') {
  return '<div class="row between"><button id="back">' + label + '</button><span class="chip">' +
    (demo ? '試玩模式' : esc(cls) + ' 班・' + seat + ' 號') + '</span></div>';
}
function home() {
  root.innerHTML = `
    <section class="hero"><div><h1>十五職群<br><span class="gold">討伐戰</span></h1>
    <p>探索科別、找出職業線索，用答對的技能擊退守關怪物。</p>
    <button id="trial">直接試玩</button></div><div class="hero-sprite" aria-hidden="true"><img src="art/hunter.webp" alt=""></div></section>
    <div class="grid">
      <form class="panel" id="student"><h2>學生登入</h2>
        <label class="field">班級<input name="cls" inputmode="numeric" pattern="[1-9][0-9]{2}" maxlength="3" placeholder="901" required></label>
        <label class="field">座號<input name="seat" type="number" min="1" max="40" placeholder="1–40" required></label>
        <button class="primary">進入班級</button></form>
      <form class="panel" id="teacher"><h2>教師登入</h2>
        <label class="field">電子郵件<input name="email" type="email" autocomplete="username" required></label>
        <label class="field">密碼<input name="password" type="password" autocomplete="current-password" required></label>
        <button>進入教師控台</button></form>
    </div><p class="status" id="status" role="status"></p>`;
  bind('trial', () => {
    if (busy) return;
    demo = true; role = 'student'; cls = ''; seat = 0; mine = {};
    locks = Object.fromEntries(milestones.map(k => [k,true]));
    render('map');
  });
  for (const id of ['student','teacher']) $(id).onsubmit = async event => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.target);
    busy = true;
    status('正在連線…');
    try {
      demo = false;
      session = await connect();
      if (id === 'teacher') {
        const auth = await session.signInWithEmailAndPassword(session.auth, form.get('email'), form.get('password'));
        uid = auth.user.uid;
        if ((await session.get(dbref('careerTeachers/' + uid))).val() !== true) {
          await session.signOut(session.auth);
          throw new Error('此帳號尚未取得教師權限。');
        }
        role = 'teacher'; cls = '901';
      } else {
        cls = String(form.get('cls')); seat = Number(form.get('seat'));
        if (!validClass(cls) || !Number.isInteger(seat) || seat < 1 || seat > 40) throw new Error('請確認班級與座號。');
        const identity = cls + '-' + seat;
        const current = session.auth.currentUser;
        if (current && (!current.isAnonymous || localStorage.getItem('career-hunter-identity') !== identity)) {
          await session.signOut(session.auth);
        }
        uid = (session.auth.currentUser || (await session.signInAnonymously(session.auth)).user).uid;
        localStorage.setItem('career-hunter-identity', identity);
        await session.set(dbref('careerStudents/' + cls + '/' + uid + '/seat'), seat);
        role = 'student';
      }
      await listen(role === 'teacher' ? 'admin' : 'map');
    } catch (error) {
      status('登入失敗。' + (error.code ? '請確認帳號或 Firebase 設定。' + error.code : error.message));
    } finally { busy = false; }
  };
}
async function listen(next, target = cls) {
  const locksRef = dbref('careerLocks/' + target);
  const recordsRef = dbref('careerStudents/' + target + (role === 'teacher' ? '' : '/' + uid));
  const [settings, saved] = await Promise.all([session.get(locksRef), session.get(recordsRef)]);
  stop(); cls = target; locks = settings.val() || {};
  if (role === 'teacher') records = saved.val() || {};
  else mine = saved.val()?.progress || {};
  render(next);
  const error = () => status('同步失敗，請檢查連線及班級權限。');
  listeners = [
    session.onValue(locksRef, snap => {
      const latest = snap.val() || {};
      if (JSON.stringify(latest) === JSON.stringify(locks)) return;
      locks = latest;
      if (screen === 'group') {
        if (!stages.some((_,s) => isOpen(active,s))) render('map');
        else updateLockControls();
      } else if (screen !== 'home') render();
    }, error),
    session.onValue(recordsRef, snap => {
      if (role === 'teacher') {
        records = snap.val() || {};
        if (screen === 'admin') roster();
      } else {
        mine = snap.val()?.progress || {};
        if (screen === 'map' || screen === 'report') render();
      }
    }, error)
  ];
}
async function logout() {
  stop();
  if (role === 'teacher' && session) await session.signOut(session.auth).catch(() => {});
  role = ''; locks = {}; records = {}; mine = {}; demo = false; render('home');
}
function map() {
  const wins = countWins(mine);
  root.innerHTML = `<div class="row between"><span class="chip">${demo ? '試玩模式' : cls + ' 班・' + seat + ' 號'}</span><button id="out">登出</button></div>
    <section class="map-banner"><h1>探索地圖</h1><div class="row"><span class="chip">擊退 ${wins}／15</span><span class="chip">${wins * 100} XP</span><button id="report" class="primary">我的學習成果</button></div>
    <nav class="map-jumps" aria-label="職群類別">${zones.map(([category,_,icon],i) => `<a href="#zone-${i}">${icon} ${category}</a>`).join('')}</nav></section>
    ${zones.map(([category, name, icon, groups],i) => `<section id="zone-${i}" class="map-zone"><h2 class="zone">${icon} ${category} <small>／ ${name}</small></h2><div class="grid">
      ${groups.map(g => { const opened = stages.some((_,s) => isOpen(g,s)); return `<article class="card map-card"><div class="map-card-art">${bossSprite(g)}</div><h3>${data[g][0]}</h3>
      <p class="muted">${progress(g,1).done ? '已擊退' : opened ? bosses[g] : '等待教師開放'}</p>
      <button data-group="${g}" ${opened ? '' : 'disabled'}>${opened ? '進入關卡' : '關卡鎖定'}</button></article>`; }).join('')}
    </div></section>`).join('')}`;
  bind('out', logout);
  bind('report', () => render('report'));
  root.querySelectorAll('[data-group]').forEach(button => button.onclick = () => {
    active = +button.dataset.group; feedback = ''; fight = false; render('group');
  });
}
async function save(g, stage, value) {
  if (!isOpen(g,stage)) throw new Error('教師已鎖定這個關卡。');
  const id = key(g,stage);
  if (!demo) {
    const ref = dbref('careerStudents/' + cls + '/' + uid + '/progress/' + id);
    await (stage === 2 ? session.update(ref,value) : session.set(ref,value));
  }
  mine = {...mine, [id]:stage === 2 ? {...mine[id],...value} : value};
}
function updateLockControls() {
  root.querySelectorAll('[data-stage]').forEach(b => {
    b.disabled = busy || !isOpen(active,+b.dataset.stage);
  });
}
function radarChart(values) {
  const scores = radarAxes.map((_,i) => {
    const value = Number(values?.[i]);
    return Number.isInteger(value) && value >= 1 && value <= 5 ? value : 0;
  });
  const coordinates = (i, radius) => [180 + radius * Math.cos(i * Math.PI / 3), 125 + radius * Math.sin(i * Math.PI / 3)];
  const point = (i,r) => coordinates(i,r).map(n => n.toFixed(2)).join(',');
  const polygon = (className, radiusAt, fill, stroke) => `<polygon class="${className}" points="${radarAxes.map((_,i) => point(i,radiusAt(i))).join(' ')}" fill="${fill}" stroke="${stroke}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 250" width="360" height="250" role="img" aria-label="能力雷達圖：${radarAxes.map((label,i) => label + ' ' + (scores[i] || '未評分')).join('、')}">
    <rect width="360" height="250" rx="12" fill="#211a32"/>
    ${[1,2,3,4,5].map(n => polygon('radar-ring',() => n*16,'none','#695881')).join('')}
    ${radarAxes.map((label,i) => {
      const [x,y] = coordinates(i,126);
      return `<line x1="180" y1="125" x2="${coordinates(i,80)[0]}" y2="${coordinates(i,80)[1]}" stroke="#695881"/>
        <text x="${x}" y="${y+5}" fill="#fff5e2" font-family="sans-serif" font-size="14" text-anchor="middle">${label}</text>`;
    }).join('')}
    ${polygon('radar-score',i => (Number(scores[i]) || 0)*16,'#ffd77950','#ffd779')}
    ${radarAxes.map((_,i) => {
      if (!scores[i]) return '';
      const [x,y] = coordinates(i, Number(scores[i])*16);
      return `<circle cx="${x}" cy="${y}" r="3.5" fill="#ffd779"/>`;
    }).join('')}
  </svg>`;
}
function savedCards(g, progress) {
  const [group,,,,courses] = data[g];
  return [
    ...(progress?.card ? [[group,progress.card]] : []),
    ...courses.flatMap(([course],n) => {
      const card = progress?.courseCards?.[n];
      return card ? [[group + '｜' + course,{...card,courses:[course]}]] : [];
    })
  ];
}
function profileText(name, card) {
  return [name,...profileFields.map(([key,label]) => label + '｜' + card[key].join('、')),
    '能力雷達分析｜' + radarAxes.map((axis,i) => axis + ' ' + card.scores[i] + '／5').join('、')].join('\n');
}
function profileCard(name, card, g) {
  const list = key => `<ul>${card[key].map(value => `<li>${esc(value)}</li>`).join('')}</ul>`;
  return `<section class="panel"><h2>${name}｜職群探索成果卡</h2>
    <div class="profile-scroll"><table class="profile-table">
      <thead><tr><th scope="col">職群</th><th scope="col">關鍵字</th><th scope="col">科系</th><th scope="col">能力雷達分析</th><th scope="col">未來職人潛力股</th></tr></thead>
      <tbody><tr><th scope="row">${name}</th><td>${list('keywords')}</td><td>${list('courses')}</td><td><div id="saved-radar-${g}">${radarChart(card.scores)}</div></td><td>${list('careers')}</td></tr></tbody>
    </table></div>
    <div class="row"><button class="primary" data-card-image="${g}">下載反思卡截圖（PNG）</button>
    <button data-radar="${g}">下載雷達圖 PNG</button></div></section>`;
}
function downloadRadar(g) {
  const svg = $('saved-radar-' + g).querySelector('svg');
  const source = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'}));
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(source);
    const canvas = document.createElement('canvas');
    canvas.width = 720; canvas.height = 500;
    canvas.getContext('2d').drawImage(image,0,0,720,500);
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = svg.closest('section').querySelector('h2').textContent + '－能力雷達圖.png';
    link.click();
  };
  image.onerror = () => { URL.revokeObjectURL(source); status('雷達圖下載失敗，請再試一次。'); };
  image.src = source;
}
async function downloadReflection(name, card, onStatus) {
  const source = URL.createObjectURL(new Blob([radarChart(card.scores)],{type:'image/svg+xml;charset=utf-8'}));
  try {
    const radar = new Image();
    const loaded = new Promise((resolve,reject) => {
      radar.onload = resolve;
      radar.onerror = reject;
    });
    radar.src = source;
    await loaded;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const width = 1000, margin = 54, lineHeight = 38;
    const font = '"Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif';
    const fields = profileFields.map(([key,label]) => [label,card[key].join('、')]);
    ctx.font = '25px ' + font;
    const blocks = fields.map(([label,value]) => {
      const lines = [];
      for (const paragraph of String(value).split('\n')) {
        let line = '';
        for (const char of paragraph) {
          if (line && ctx.measureText(line + char).width > width - 2 * margin) {
            lines.push(line);
            line = '';
          }
          line += char;
        }
        lines.push(line);
      }
      return {label,lines};
    });
    canvas.width = width;
    canvas.height = 595 + blocks.reduce((height,block) => height + 54 + block.lines.length * lineHeight,0);
    ctx.fillStyle = '#171327';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#ffd779';
    ctx.fillRect(0,0,width,10);
    const text = (value,x,y,size,color,bold = false) => {
      ctx.fillStyle = color;
      ctx.font = (bold ? 'bold ' : '') + size + 'px ' + font;
      ctx.fillText(value,x,y);
    };
    text('職群探索反思卡',margin,72,36,'#ffd779',true);
    text(name,margin,126,35,'#ffffff',true);
    text(demo ? '試玩成果' : cls + ' 班　' + seat + ' 號',margin,167,23,'#d9d0e8');
    let y = 222;
    for (const {label,lines} of blocks) {
      text(label,margin,y,26,'#ffd779',true);
      y += lineHeight;
      for (const line of lines) {
        text(line,margin,y,25,'#fff5e2');
        y += lineHeight;
      }
      y += 16;
    }
    text('能力雷達分析',margin,y,26,'#ffd779',true);
    ctx.drawImage(radar,margin,y+18,456,317);
    radarAxes.forEach((axis,i) => text(axis + '　' + card.scores[i] + '／5',550,y+67+i*40,25,'#fff5e2'));
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = name.replaceAll('｜','－') + '－職群探索反思卡.png';
    link.click();
    onStatus('已產生反思卡 PNG，可當作附件上傳。');
  } catch {
    onStatus('無法產生反思卡截圖，請再試一次。');
  } finally {
    URL.revokeObjectURL(source);
  }
}
function group() {
  const g = active;
  const [name, icon, subjects, skills, courses] = data[g];
  const state = progress(g,1);
  const answers = state.answers || {};
  const won = courses.filter((_,n) => answers[n]?.correct).length;
  const index = courses.findIndex((_,n) => !answers[n]?.correct);
  const scenario = scenarios[g];
  const branch = state.storyBranch;
  const storyDone = state.storyDone === true;
  const path = scenario?.branches[branch];
  const maximumHp = scenario ? 2 : courses.length;
  const hp = scenario ? storyDone ? 0 : path ? 1 : 2 : courses.length - won;
  const defeated = hp === 0;
  const card = progress(g,2).card || {};
  const imageOffset = data.slice(0,g).reduce((total,group) => total + group[4].length,0);
  const details = profiles[g].split('|');
  const question = courses[index];
  const options = question ? (index % 2 ? [question[4],question[3]] : [question[3],question[4]]) : [];
  root.innerHTML = `<div class="turn">${nav()}<h1>${icon} ${name}</h1><section class="battle-stage" aria-label="戰鬥場景">
      <div class="battle-hud"><div><span class="muted">守關怪物</span><h2>${bosses[g]}</h2></div>
      <label>怪物 HP　${hp}／${maximumHp}<progress class="hp" max="${maximumHp}" value="${hp}"></progress></label></div>
      <div class="combatants" aria-hidden="true">
        <img class="hunter-sprite" src="art/hunter.webp" alt="" width="240" height="240">
        ${bossSprite(g,defeated ? 'defeated' : '')}
        <span class="slash"></span><span class="damage">−1 HP</span>
      </div>
      <div class="battle-footer">
        ${defeated ? '<strong class="victory">討伐成功　+100 XP</strong>' :
          `<button class="primary" id="fight" data-stage="1">${fight ? '挑戰進行中' : scenario ? (path ? '⚔ 繼續情境任務' : '⚔ 接下情境委託') : '⚔ 開始打怪'}</button>`}
        ${!isOpen(g,1) ? '<span class="muted">教師尚未開放挑戰。</span>' : ''}
      </div>
    </section>
    <p class="status battle-status" id="status" role="status">${esc(feedback)}</p>
    ${scenario && fight && !storyDone && isOpen(g,1) ? `<section class="panel challenge">
      <h2>${scenario.title}</h2><p>${path ? scenario.choices[branch][1] : scenario.opening}</p>
      ${(path || scenario.choices).map(([option],n) => `<button class="answer" data-story="${n}" data-stage="1"><span aria-hidden="true">${'ABC'[n]}</span>${option}</button>`).join('')}
      </section>` : ''}
    ${scenario && storyDone && isOpen(g,1) ? `<section class="panel"><h2>任務紀錄｜${scenario.title}</h2><p class="report">${esc(scenarioResult(g,state))}</p>
      ${isOpen(g,2) ? '<button id="story-reflect">用任務線索填寫成果卡</button>' : ''}</section>` : ''}
    ${!scenario && fight && question ? `<section class="panel challenge"><h2>${question[0]} · 技能挑戰</h2><p>${question[2]}</p>
    ${options.map((option,n) => `<button class="answer" data-option="${n}" data-stage="1"><span aria-hidden="true">${'AB'[n]}</span>${option}</button>`).join('')}</section>` : ''}
    <section class="panel"><h2>科別圖鑑</h2>
    ${isOpen(g,0) ? `<p><b>國中學習連結</b>　${subjects}</p><p><b>可培養能力</b>　${skills}</p><p><b>學生特質線索</b>　${traits[g]}。可用來觀察自己的興趣。</p>
    <p class="muted">以下為代表科別與可能職涯，實際開設以各校簡章為準。</p>
    ${courses.map((course,n) => {
      const [training,career] = details[n].split('／');
      const [axisIds,activity] = courseActivities[g][n];
      const clues = Array.from(axisIds, id => radarAxes[Number(id)]).join('、');
      return `<details class="course-entry"><summary>
        <img class="course-image" src="art/courses/${imageOffset + n}.webp" width="225" height="188" loading="lazy" decoding="async" alt="${esc(course[0])}實作示意">
        <span><strong>${course[0]}</strong><span class="course-topic">${course[1]}</span></span>
      </summary><div class="course-evidence">
        <p><b>實作情境</b>　${activity}</p>
        <p><b>練習能力</b>　${training}</p>
        <p><b>雷達圖線索</b>　${clues}。任務中哪些動作可以作為你評分的證據？</p>
        <p><b>職涯方向</b>　${career}</p>
        <button type="button" data-evidence="${n}" data-stage="2">把這個情境帶入職群反思</button>
      </div></details>`;
    }).join('')}
    <div class="row"><a class="button" href="${careerReadingUrl}" target="_blank" rel="noopener noreferrer">延伸閱讀｜技職大玩 JOB（另開分頁）</a><a class="button" href="${careerGuideUrl}" target="_blank" rel="noopener noreferrer">國教署生涯探索（另開分頁）</a></div>
    <button id="read" data-stage="0">${progress(g,0).done ? '已閱讀圖鑑' : '完成圖鑑閱讀'}</button>` : '<p class="muted">教師尚未開放圖鑑。</p>'}
    </section>
    <section class="panel"><h2>最後反思｜職群探索成果卡</h2>
    <p>以<strong>${name}</strong>為整張反思卡的作答主題。比較同一職群的科別，再用圖鑑中的實作情境，判斷六項能力對這個職群的重要程度。</p>
    <div class="row"><a class="button" href="${careerGuideUrl}" target="_blank" rel="noopener noreferrer">查閱國教署生涯探索資料（另開分頁）</a></div>
    ${isOpen(g,2) ? `<form id="career-card">
      ${profileFields.map(([key,label]) => `<label class="field">${label}（${key === 'courses' ? '填 2～3 項' : '填 3 項'}，每項一行）
        <textarea name="${key}" rows="3" required maxlength="120">${esc(card[key]?.join('\n'))}</textarea></label>`).join('')}
      <h3 id="ability-heading" tabindex="-1">能力雷達分析</h3>
      <p>依這個職群的任務評分。1 分表示很少用到，3 分表示視任務而定，5 分表示經常用到或對完成任務很重要。</p>
      <p class="course-evidence" id="ability-evidence" hidden></p>
      <div class="radar-layout"><div class="radar-controls">${radarAxes.map((axis,i) => `<label class="field">${axis}<select name="axis-${i}" required><option value="">請選擇</option>
        ${[1,2,3,4,5].map(n => `<option value="${n}" ${card.scores?.[i] === n ? 'selected' : ''}>${n}</option>`).join('')}</select><small>${radarPrompts[i]}</small></label>`).join('')}</div>
      <div id="radar-preview">${radarChart(card.scores || [])}</div></div>
      <div class="row"><button class="primary" data-stage="2">儲存成果卡</button>
      <button type="button" id="capture-card" ${card.scores ? '' : 'disabled'}>下載反思卡截圖（PNG）</button></div>
      <p class="muted">截圖使用已儲存的內容。修改後請先儲存，再下載圖片。</p>
    </form>` : '<p class="muted">教師開放最後反思後，即可填寫成果卡。</p>'}
    <p id="card-status" class="status" role="status"></p></section></div>`;
  bind('back', () => render('map'));
  bind('read', () => act(0,{done:true},'已記錄圖鑑閱讀。'));
  bind('fight', () => {
    feedback = ''; fight = true; render();
    root.querySelector('.battle-stage')?.scrollIntoView({block:'start'});
    root.querySelector('[data-story], [data-option]')?.focus({preventScroll:true});
  });
  bind('story-reflect', () => $('career-card')?.scrollIntoView({block:'start'}));
  root.querySelectorAll('[data-story]').forEach(button => button.onclick = () => {
    if (busy || !isOpen(g,1)) return;
    const choice = Number(button.dataset.story);
    const [, outcome] = (path || scenario.choices)[choice];
    if ((!path && choice === 2) || (path && choice !== branch)) {
      status(outcome);
      return;
    }
    const next = path ? {...state, storyDone:true, done:true} : {...state, storyBranch:choice};
    act(1,next,outcome + '　怪物 HP −1。',true);
  });
  root.querySelectorAll('[data-option]').forEach(button => button.onclick = () => {
    const current = answers[index] || {};
    const correct = +button.dataset.option === index % 2;
    const updated = {...answers,[index]:{correct,first:current.first ?? correct,attempts:(current.attempts || 0)+1}};
    const done = courses.every((_,n) => updated[n]?.correct);
    act(1,{answers:updated,done},correct ? question[3] + '，答對了！怪物 HP −1。' : '再試一次。可以回圖鑑查閱「' + question[0] + '」。',correct);
  });
  bind('capture-card', () => {
    const saved = progress(g,2).card;
    if (saved && !busy) downloadReflection(name,saved,message => {
      if (screen === 'group' && active === g) $('card-status').textContent = message;
    });
  });
  const cardForm = $('career-card');
  if (cardForm) {
    root.querySelectorAll('[data-evidence]').forEach(button => button.onclick = () => {
      if (!isOpen(g,2)) return;
      const n = Number(button.dataset.evidence);
      const [axisIds,activity] = courseActivities[g][n];
      const labels = Array.from(axisIds, id => radarAxes[Number(id)]).join('、');
      const evidence = $('ability-evidence');
      evidence.textContent = '你選擇的線索｜' + courses[n][0] + '：' + activity + ' 可先想想「' + labels + '」。';
      evidence.hidden = false;
      $('ability-heading').focus({preventScroll:true});
      $('ability-heading').scrollIntoView({block:'start'});
    });
    const readScores = form => radarAxes.map((_,i) => Number(form.get('axis-' + i)));
    cardForm.addEventListener('change', event => {
      if (event.target.name.startsWith('axis-')) $('radar-preview').innerHTML = radarChart(readScores(new FormData(cardForm)));
    });
    cardForm.onsubmit = event => {
      event.preventDefault();
      const form = new FormData(cardForm);
      const fields = Object.fromEntries(profileFields.map(([key]) => [key,String(form.get(key)).split(/\r?\n/).map(value => value.trim()).filter(Boolean)]));
      const scores = readScores(form);
      if (Object.entries(fields).some(([key,items]) => items.length < (key === 'courses' ? 2 : 3) || items.length > 3 || new Set(items).size !== items.length) ||
          scores.some(n => !Number.isInteger(n) || n < 1 || n > 5)) {
        $('card-status').textContent = '請填寫 3 個關鍵字、2～3 個科別和 3 個職涯方向，完成六項評分。';
        return;
      }
      act(2,{card:{...fields,scores}},'成果卡已儲存，可到「我的學習成果」查看。');
    };
  }
  updateLockControls();
  if (fight && isOpen(g,1)) $('fight')?.setAttribute('disabled','');
}
async function act(stage, update, message, strike = false) {
  if (busy) return;
  const g = active;
  busy = true; updateLockControls();
  const formStatus = update.card ? 'card-status' : '';
  let resultMessage = message;
  try {
    await save(g,stage,update);
    if (!formStatus) feedback = message;
  } catch (error) {
    resultMessage = '儲存失敗。' + error.message;
    if (!formStatus) feedback = resultMessage;
  }
  finally {
    busy = false;
    if (screen === 'group' && active === g) {
      if (formStatus) {
        updateLockControls();
        $(formStatus).textContent = resultMessage;
        if ($('capture-card')) $('capture-card').disabled = !progress(g,2).card;
        return;
      }
      render();
      if (strike && feedback === message) root.querySelector('.battle-stage')?.classList.add('struck');
      if (stage === 1) root.querySelector('[data-story], [data-option]')?.focus({preventScroll:true});
    }
  }
}
function scenarioResult(g,state) {
  const scenario = scenarios[g];
  const branch = state.storyBranch;
  const start = scenario?.choices[branch];
  const solution = scenario?.branches[branch]?.[branch];
  if (!state.storyDone || !start || !solution) return '';
  return '我的路線｜' + start[0] + ' → ' + solution[0] + '\n' + solution[1];
}
function report() {
  const won = data.filter((_,g) => progress(g,1).done).map(d => d[0]);
  const studied = data.filter((_,g) => progress(g,0).done).map(d => d[0]);
  const cards = data.flatMap((_,g) => savedCards(g,progress(g,2)));
  const journeys = data.flatMap(([name],g) => {
    const result = scenarioResult(g,progress(g,1));
    return result ? [name + '｜' + scenarios[g].title + '\n' + result] : [];
  });
  const title = demo ? '十五職群討伐戰｜試玩成果' : cls + ' 班 ' + seat + ' 號｜職群探索成果';
  const body = [title, '已閱讀圖鑑：' + (studied.join('、') || '尚未記錄'),
    '已擊退守關怪物：' + won.length + '／15' + (won.length ? '（' + won.join('、') + '）' : ''),
    ...(journeys.length ? ['情境任務紀錄',journeys.join('\n\n')] : []),
    ...(cards.length ? ['職群探索成果卡',cards.map(([name,card]) => profileText(name,card)).join('\n\n')] : [])].join('\n\n');
  const ready = cards.length > 0;
  const board = padlet(locks.padlet_hunt);
  root.innerHTML = `<div class="turn">${nav()}<h1>我的學習成果</h1>
    ${cards.map(([name,card],i) => profileCard(name,card,i)).join('')}
    <section class="panel"><div class="report" id="report-text">${esc(body)}</div></section>
    ${ready ? `<div class="row"><button id="copy" class="primary">複製成果</button><button id="save-file">下載成果</button>
    ${board ? `<a class="button" target="_blank" rel="noopener noreferrer" href="${esc(board)}">開啟班級 Padlet</a>` : ''}</div>
    <p class="muted">${board ? '下載反思卡 PNG 後，前往 Padlet 新增貼文並上傳圖片附件。' : demo ? '試玩可下載成果。正式課堂的 Padlet 連結由教師設定。' : '教師尚未設定班級 Padlet。可先下載成果。'}</p>` :
    '<p>儲存一張職群探索成果卡，即可匯出成果。</p>'}
    <p class="status" id="status" role="status"></p></div>`;
  bind('back', () => render('map'));
  bind('copy', async () => {
    try { await navigator.clipboard.writeText(body); status('已複製，可以貼到 Padlet。'); }
    catch {
      const range = document.createRange();
      range.selectNodeContents($('report-text'));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      status('已選取文字。請使用裝置的複製功能。');
    }
  });
  bind('save-file', () => download(title + '.txt',body,'text/plain'));
  root.querySelectorAll('[data-card-image]').forEach(button => button.onclick = () => {
    const [name,card] = cards[Number(button.dataset.cardImage)];
    downloadReflection(name,card,status);
  });
  root.querySelectorAll('[data-radar]').forEach(button => button.onclick = () => downloadRadar(Number(button.dataset.radar)));
}
function download(filename, content, mime) {
  const url = URL.createObjectURL(new Blob(['\ufeff' + content],{type:mime + ';charset=utf-8'}));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function stats(record) {
  const p = record.progress || {};
  const answers = data.flatMap((_,g) => Object.values(p[key(g,1)]?.answers || {}));
  return {wins:countWins(p), questions:answers.length, first:answers.filter(answer => answer.first).length,
    attempts:answers.reduce((total,answer) => total + (Number(answer.attempts) || 0),0)};
}
const sortedRecords = () => Object.values(records).sort((a,b) => Number(a.seat) - Number(b.seat));
function roster() {
  const target = $('roster');
  if (!target) return;
  const expanded = new Set([...target.querySelectorAll('details[open]')].map(x => x.dataset.uid));
  target.innerHTML = Object.entries(records).sort((a,b) => Number(a[1].seat) - Number(b[1].seat)).map(([id,record]) => {
    const s = stats(record), p = record.progress || {};
    const items = data.flatMap((_,g) => savedCards(g,p[key(g,2)])).map(([name,card]) =>
      `<p class="report"><b>職群探索成果卡</b>\n${esc(profileText(name,card))}</p>`);
    return `<details data-uid="${esc(id)}" ${expanded.has(id)?'open':''}><summary>${esc(record.seat)} 號 · 擊退 ${s.wins}／15 · 首次答對 ${s.first}／${s.questions} · 作答 ${s.attempts} 次</summary>
      ${items.join('') || '<p class="muted">尚無成果卡</p>'}</details>`;
  }).join('') || '<p class="muted">目前沒有學生登入紀錄。</p>';
}
async function updateSettings(patch) {
  try { await session.update(dbref('careerLocks/' + cls),patch); status('班級設定已更新。'); }
  catch (error) { status('更新失敗。' + error.message); }
}
function admin() {
  root.innerHTML = `<div class="row between"><span class="chip">教師模式</span><button id="out">登出</button></div>
    <h1>班級控台</h1><section class="panel"><h2>${esc(cls)} 班</h2>
    <form id="switch" class="row"><label for="class-input">切換班級</label><input id="class-input" inputmode="numeric" pattern="[1-9][0-9]{2}" maxlength="3" required value="${esc(cls)}"><button>切換</button></form>
    <form id="board-form"><label class="field">班級 Padlet 看板網址<input id="board" type="url" placeholder="https://padlet.com/…" value="${esc(locks.padlet_hunt || '')}"></label><button>儲存 Padlet 網址</button></form>
    <p class="muted">學生須具備此看板的發文權限。清空網址並儲存可移除連結。</p>
    <p class="status" id="status" role="status"></p></section>
    <div class="row"><button id="all" class="primary">全部開放</button><button id="none">全部鎖定</button></div>
    ${zones.map(([category,_,icon,groups]) => `<h2 class="zone">${icon} ${category}</h2><div class="grid">
      ${groups.map(g => `<article class="card"><h3>${data[g][0]}</h3><div class="stack">
      ${stages.map((s,k) => `<button data-key="${key(g,k)}" aria-pressed="${isOpen(g,k)}">${isOpen(g,k) ? '開放' : '鎖定'} · ${s}</button>`).join('')}
      </div></article>`).join('')}</div>`).join('')}
    <section class="panel zone"><div class="row between"><h2>學生學習紀錄</h2><button id="csv">下載班級 CSV</button></div><div id="roster"></div></section>`;
  bind('out',logout);
  $('switch').onsubmit = async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    try { await listen('admin',$('class-input').value); }
    catch (error) { status('切換失敗。' + error.message); }
    finally { busy = false; }
  };
  $('board-form').onsubmit = event => {
    event.preventDefault();
    const value = $('board').value.trim();
    const url = padlet(value);
    if (value && !url) return status('請貼上有效的 HTTPS Padlet 看板網址。');
    updateSettings({padlet_hunt:url || null});
  };
  bind('all', () => updateSettings(Object.fromEntries(milestones.map(k => [k,true]))));
  bind('none', () => updateSettings(Object.fromEntries(milestones.map(k => [k,null]))));
  root.querySelectorAll('[data-key]').forEach(button => button.onclick = () =>
    updateSettings({[button.dataset.key]:locks[button.dataset.key] === true ? null : true}));
  bind('csv', () => {
    const items = sortedRecords().map(r => {
      const s = stats(r);
      return [cls,Number(r.seat) || '',s.wins,s.questions,s.first,s.attempts];
    });
    download(cls + '班職群探索.csv',
      [['班級','座號','擊退怪物','已答題數','首次答對','作答次數'],...items].map(row => row.join(',')).join('\r\n'),
      'text/csv');
  });
  roster();
}
render('home');
