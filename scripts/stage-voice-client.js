import { StageMicrophoneController } from './stage-microphone-controller.js';
import { parsers } from 'prettier/plugins/babel';

/** A única captura: palanque fixo ou palco do caminhão de som. */
export function stageMicrophone(n) {
  return new StageMicrophoneController(n).controller();
}
export function stageMicrophoneSource() {
  return StageMicrophoneController.toString() + '\n' + stageMicrophone.toString();
}

export function stageVoiceMayPlay(receiver, id) {
  return id === receiver.net.id
    ? receiver.transmitting === true && receiver.monitorSelf === true
    : !receiver.transmitting;
}

function replaceOne(source, before, after) {
  const at = source.indexOf(before);
  if (at < 0 || at !== source.lastIndexOf(before))
    throw new Error(`Patch de voz único incompatível: ${before.slice(0, 90)}`);
  return source.replace(before, after);
}
export function applyStageVoiceListening(source) {
  return replaceOne(
    source,
    '      e || this.closeAll());',
    '      e ? this.renderBanner() : this.closeAll());',
  );
}
function declaration(source, name, replacement) {
  const ast = parsers.babel.parse(source, {});
  const item = ast.program.body.find((item) => item.id?.name === name);
  if (!item) throw new Error(`Declaração ausente ${name}`);
  return source.slice(0, item.start) + replacement + source.slice(item.end);
}
function method(source, klass, name, replacement) {
  const ast = parsers.babel.parse(source, {});
  const parent = ast.program.body.find((item) => item.id?.name === klass);
  const item = parent.body.body.find((item) => item.key?.name === name);
  if (!item) throw new Error(`Método ausente ${klass}.${name}`);
  return source.slice(0, item.start) + replacement + source.slice(item.end);
}

function removeDebateVoice(source) {
  // Mesa conserva tema, fila e participantes; não existe captura ou controle de voz.
  source = replaceOne(source, '      (this.voice = new jV(e, a, () => this.audioView())),\n', '');
  let begin = source.indexOf('    const w = qe("input");', source.indexOf('class JV {'));
  let end = source.indexOf('      (this.hostPanel.className', begin);
  if (begin < 0 || end < 0) throw new Error('Bloco áudio da mesa ausente');
  source = source.slice(0, begin) + '    (\n' + source.slice(end);
  begin = source.indexOf('      (this.micPanel.className', source.indexOf('class JV {'));
  end = source.indexOf('      (this.error.className', begin);
  if (begin < 0 || end < 0) throw new Error('Dock áudio da mesa ausente');
  source = source.slice(0, begin) + source.slice(end);
  for (const name of ['toggleMic', 'restartMic', 'testMicrophone', 'devices'])
    source = method(source, 'JV', name, '');
  source = method(
    source,
    'JV',
    'audioView',
    'audioView(){this.status.textContent="Mesa sem áudio · use o chat do jogo";document.body.classList.remove("debate-seated");}',
  );
  source = method(source, 'JV', 'muteGameSounds', 'get muteGameSounds(){return false;}');
  source = source
    .replace('      this.voice.stop(),\n', '')
    .replace('      this.voice.update(r, this.state, { ...this.me, role: this.role() }),\n', '');
  source = source.replace('          !this.micPanel.contains(P) &&\n', '');
  source = method(source, 'JV', 'message', 'message(e){this.error.textContent=e;}');
  source = method(source, 'JV', 'disconnectAudio', '');
  for (const field of [
    'voice',
    'micPanel',
    'micBadge',
    'micHint',
    'micError',
    'device',
    'meter',
    'audioStatus',
    'micBusy',
  ])
    source = method(source, 'JV', field, '');
  source = source.replace('this.role() !== "listener" && this.devices()', 'void 0');
  source = source.replace('(this.meter.value = this.voice.inputLevel)', 'void 0');
  begin = source.indexOf(
    '      for (const d of this.seats.children)',
    source.indexOf('class JV {'),
  );
  end = source.indexOf('      this.clock.textContent', begin);
  source = source.slice(0, begin) + source.slice(end);
  // Remove os campos que antes criavam botões desconectados.
  for (const field of ['testMic', 'micButton']) source = method(source, 'JV', field, '');
  begin = source.indexOf(
    '          const c = qe("input");',
    source.indexOf('      for (const s of [e?.host, e?.guest])'),
  );
  end = source.indexOf('\n        }\n        this.seats.append(o);', begin);
  source = source.slice(0, begin) + '          o.append(r);' + source.slice(end);
  begin = source.indexOf('            r.append(\n              nn(s.muted');
  end = source.indexOf('            s === e?.guest', begin);
  source = source.slice(0, begin) + source.slice(end);
  source = source.replace(
    '(r.className = "debate-actions"),\n            s ===',
    '(r.className = "debate-actions"),\n            s ===',
  );
  source = source.replace('nn("Desconectar áudio", () => this.disconnectAudio()),', '');
  return source;
}

function replaceSocialVoice(source) {
  let begin, end;
  source = source.replace(
    'const x = new ej(n.net, n.audio, () => Se());',
    'const x = {syncRoom(){},stop(){}};',
  );
  source = source.replace('["voice", "Voz"]', '["voice", "Grupos"]');
  source = source.replaceAll('Amigos, mensagens e voz', 'Amigos, mensagens e grupos');
  source = source.replace(
    'b = st("button", "", "Ligar microfone")',
    'b = st("button", "", "Grupo")',
  );
  source = source.replace('m.append(p, b, v), n.hud.append(m)', 'm.append(p, v), n.hud.append(m)');
  source = source.replace(
    '(b.onclick = () => {\n      __localVoiceControls(message => n.toast(message), le);\n    })',
    '(b.onclick = null)',
  );
  begin = source.indexOf('  const p = st("span"),', source.indexOf('function nj(n)'));
  end = source.indexOf('  const v = st("button", "", "Sala");', begin);
  source = source.slice(0, begin) + '  const p = st("span");\n' + source.slice(end);
  source = source.replace('m.append(p, b, v)', 'm.append(p, v)');
  source = source.replace(',\n    (b.onclick = null)', '');
  begin = source.indexOf('  function Se() {', source.indexOf('function nj(n)'));
  end = source.indexOf('\n  function ve(', begin);
  source =
    source.slice(0, begin) +
    `  function Se(){m.hidden=!re&&!we;p.textContent=re?'Grupo · '+re.members.length+'/'+re.max:we?we.nick+' chamou você':'';}` +
    source.slice(end);
  // Grupo textual mantém as ações de organização existentes.
  begin = source.indexOf('  function I() {', source.indexOf('function nj(n)'));
  end = source.indexOf('\n  function D()', begin);
  if (begin < 0 || end < 0) throw new Error('Grupo social ausente');
  source =
    source.slice(0, begin) +
    `  function I(){g.replaceChildren();const box=st('div','social-voice');box.append(st('p','social-note','Grupo de amigos · sem áudio'));if(re){box.append(st('h3','',re.members.length+' de '+re.max));const leave=st('button','','Sair do grupo');leave.onclick=()=>L({a:'voice_leave'});box.append(leave);for(const member of re.members)box.append(st('p','',member.nick));for(const friend of k.filter(friend=>!re.members.some(member=>member.uid===friend.uid)).slice(0,12))box.append(ae(friend,[['Convidar',()=>L({a:'voice_invite',uid:friend.uid})]]));}else{const create=st('button','','Criar grupo');create.onclick=()=>L({a:'voice_open'});box.append(create);}g.append(box);}` +
    source.slice(end);
  // Sem qualquer chamada para o painel mesh eliminado.
  source = source
    .replaceAll('Grupo e voz local', 'Grupo de amigos')
    .replaceAll('sala de voz', 'grupo de amigos');
  source = source.replaceAll(
    'O áudio desta instalação usa o painel Voz local: sala compartilhada para até 12 participantes, sem sala privada ou escuta por proximidade. Entrar na voz exige sua permissão de microfone.',
    'As mesas não transmitem voz; converse pelo chat do jogo.',
  );
  source = source.replaceAll(
    'O áudio fica no painel Voz local, sem escuta automática da mesa.',
    'Converse pelo chat do jogo.',
  );
  source = source
    .replaceAll(
      'A voz compartilhada fica no painel Voz local, dentro do jogo.',
      'Grupos não transmitem áudio.',
    )
    .replaceAll('Voz local', 'Grupo de amigos');
  source = source.replace(
    'Você está na cadeira de debate. Ative seu microfone quando estiver pronto.',
    'Você está na cadeira de debate. Converse pelo chat do jogo.',
  );
  source = source
    .replaceAll('AO VIVO no palanque:', 'AO VIVO no palco:')
    .replaceAll('som do palanque desligado', 'voz dos palcos desligada');
  return source;
}

export function applyStageVoiceClient(source) {
  // O patch vem por último: os adaptadores visuais ainda usam âncoras do cliente coletado.
  source =
    StageMicrophoneController.toString() + '\n' + stageVoiceMayPlay.toString() + '\n' + source;
  source = declaration(source, 'aY', stageMicrophone.toString().replace('stageMicrophone', 'aY'));
  for (const name of ['S1', 'jV', 'KV', 'ej', '__localVoiceControls'])
    source = declaration(source, name, '');
  source = declaration(
    source,
    'ZV',
    `class ZV {
    constructor(net){this.net=net;this.panel=Dn('section');this.panel.className='truck-voice-dock';this.panel.hidden=true;document.body.append(this.panel);net.addEventListener('truck_deck',e=>{this.state=e.detail;this.paint();});net.addEventListener('connection',e=>{if(!e.detail.connected){this.state=null;this.paint();}});}
    sync(on,truck){this.onDeck=on;this.truck=truck;this.paint();}
    paint(){const e=this.state;this.panel.hidden=!e||!(this.onDeck&&e.truck===this.truck||e.you.role==='owner');if(this.panel.hidden){this.key='';return;}const key=JSON.stringify(e);if(key===this.key)return;this.key=key;this.panel.replaceChildren(Dn('h3','Palco do caminhão de som'));for(const rider of e.riders||[])this.panel.append(Dn('p',rider.nick||'Jogador'));}
  }`,
  );
  source = removeDebateVoice(source);
  source = replaceSocialVoice(source);
  // Um quarto slot corresponde à posição móvel do palco da carreta.
  source = replaceOne(
    source,
    'if (this.stages.length || !this.sound.voiceBus) return this.stages;\n    for (let t = 0; t < Pn.length; t++) {',
    'if (this.stages.length || !this.sound.voiceBus) return this.stages;\n    for (let t = 0; t <= Pn.length; t++) {',
  );
  source = source.replace('A >= Pn.length || this.frame', 'A > Pn.length || this.frame');
  source = source.replace(
    'Pn.forEach((c, l) => {\n      const d = this.stages[l],\n        h = c.mouth,',
    '[...Pn, {mouth: {x: 0, y: 2.8, z: 0}}].forEach((c, l) => {\n      const live=this.live.find(person=>person.stage===l);\n      const d = this.stages[l],\n        h = l===Pn.length&&live ? {x:live.x,y:2.8,z:live.z} : c.mouth,',
  );
  source = source.replace(
    'f <= nu ? 1 : Math.max(pw, 1 - ((1 - pw) * (f - nu)) / (eY - nu))',
    '!live || f >= 60 ? 0 : f <= 10 ? 1 : (60-f)/50',
  );
  source = source.replace('Pn[i.stage]?.team ?? 0', 'Pn[i.stage]?.team ?? 0');
  // O orador nunca reproduz voz recebida, inclusive buffers atrasados.
  source = replaceOne(
    source,
    'if (!t || t.state !== "running" || !this.sound.voiceWanted()) return;',
    'if ((this.transmitting && !this.monitorSelf) || !t || t.state !== "running" || !this.sound.voiceWanted()) return;',
  );
  source = replaceOne(
    source,
    '  play(e, t, i, a) {\n    const s = t.due.get(a);',
    '  play(e, t, i, a) {\n    if(this.streams.get(t.stage*1e7+t.id)!==t || !this.sound.voiceWanted() || e.state!=="running" || !stageVoiceMayPlay(this,t.id))return;\n    const s = t.due.get(a);',
  );
  source = replaceOne(
    source,
    '!live || f >= 60 ? 0 : f <= 10 ? 1 : (60-f)/50',
    '!live || !stageVoiceMayPlay(this,live.id) || f >= 60 ? 0 : f <= 10 ? 1 : (60-f)/50',
  );
  source = replaceOne(
    source,
    'c === this.net.id || A > Pn.length || this.frame',
    '!stageVoiceMayPlay(this,c) || A > Pn.length || this.frame',
  );
  // Interrompe os fluxos recebidos se a rede ou a página sair de uso.
  source = replaceOne(
    source,
    'e.addEventListener("voice", (a) => this.receive(a.detail)))',
    'e.addEventListener("voice", (a) => this.receive(a.detail)), e.addEventListener("connection", a=>{if(!a.detail.connected){this.live=[];this.asked=null;this.closeAll();}}),addEventListener("pagehide",()=>this.closeAll()))',
  );
  source = applyStageVoiceListening(source);
  source = source.replace(
    '((u.dec = f), (this.stats.decoder = f.kind));',
    'if(this.streams.get(o)!==u){f.close();return;} ((u.dec = f), (this.stats.decoder = f.kind));',
  );
  source = source.replace(
    '((o.fftSize = 256),\n        i.connect(a)',
    '((o.fftSize = 256), (s.gain.value=0),\n        i.connect(a)',
  );
  parsers.babel.parse(source, {});
  return source.replace(/^[\t ]+$/gm, '');
}
