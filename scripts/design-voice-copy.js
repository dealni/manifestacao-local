const notice =
  'O áudio desta instalação usa o painel Voz local: sala compartilhada para até 12 participantes, sem sala privada ou escuta por proximidade. Entrar na voz exige sua permissão de microfone.';

function once(source, before, after) {
  const at = source.indexOf(before);
  if (at < 0 || at !== source.lastIndexOf(before))
    throw new Error(`Patch de voz incompatível ou ambíguo: ${before.slice(0, 65)}`);
  return source.replace(before, after);
}

/** A instalação local tem sinalização WebRTC própria; não emite tokens LiveKit. */
export function applyVoiceCopyDesign(source) {
  source = once(source, '"Convidar para a voz"', '"Convidar para o grupo"');
  source = once(
    source,
    '            "Voz",\n            () => {',
    '            "Grupo",\n            () => {',
  );
  source = once(
    source,
    'class jV {',
    `function __localVoiceControls(notify, close) {
  const panel = document.getElementById("local-voice");
  if (!document.body.classList.contains("playing") || typeof panel?.openVoiceControls !== "function") {
    notify("Entre no jogo para acessar o painel Voz local. Se ele não aparecer, recarregue a página.");
    return false;
  }
  const trigger = document.activeElement;
  close?.();
  return panel.openVoiceControls(trigger);
}
class jV {`,
  );
  source = once(
    source,
    'A sala funciona em qualquer lugar do mapa, para até 20 amigos. O microfone começa desligado.',
    `Este grupo organiza até 20 amigos, mas não transmite áudio. ${notice}`,
  );
  source = once(
    source,
    'const se = st("button", "", "Abrir sala de voz");',
    'const se = st("button", "", "Criar grupo sem áudio privado");',
  );
  source = once(
    source,
    'Entre na sua conta do Brasil TD para adicionar amigos, mandar mensagem privada e abrir uma sala de voz. Visitante não guarda nada disso entre sessões.',
    'Entre na sua conta local para adicionar amigos, mandar mensagens e organizar grupos. A voz compartilhada fica no painel Voz local, dentro do jogo.',
  );
  source = once(
    source,
    'oe.append(st("p", "social-note", x.status))',
    'oe.append(st("p", "social-note", "O estado do microfone aparece no painel Voz local."))',
  );
  source = once(
    source,
    'fe.muted ? "Liberar mic" : "Silenciar"',
    'fe.muted ? "Desmarcar silêncio no grupo" : "Marcar silêncio só neste grupo"',
  );
  source = once(
    source,
    'b.setAttribute("aria-pressed", "false"));',
    'b.removeAttribute("aria-pressed"));',
  );
  source = once(
    source,
    'b.setAttribute("aria-pressed", String(x.on))',
    'b.removeAttribute("aria-pressed")',
  );
  source = once(
    source,
    '    g.append(oe);\n  }\n  function D() {',
    `    const localVoice = st("button", "", "Controles de voz local");
    localVoice.type = "button";
    localVoice.onclick = () => __localVoiceControls(message => n.toast(message), le);
    oe.append(localVoice);
    g.append(oe);
  }
  function D() {`,
  );
  source = once(
    source,
    '(p.textContent = `Voz · ${re.members.length}/${re.max} · ${x.on ? "mic ligado" : "mic desligado"}`)',
    '(p.textContent = `Grupo · ${re.members.length}/${re.max} · sem áudio privado`)',
  );
  source = once(
    source,
    '(b.textContent = x.on ? "Desligar microfone" : "Ligar microfone")',
    '(b.textContent = "Voz local")',
  );
  source = once(source, '(b.disabled = !re.publish && !x.on)', '(b.disabled = !1)');
  source = once(
    source,
    `      (x.on ? x.disable() : x.enable()).catch((oe) =>
        n.toast(oe.message || "Não foi possível ligar o microfone."),
      );`,
    '      __localVoiceControls(message => n.toast(message), le);',
  );
  source = once(
    source,
    'Há mais de uma mesa por perto. Escolha qual ouvir.',
    'Há mais de uma mesa por perto. Escolha qual acompanhar.',
  );
  source = once(source, 'qe("h3", "Ouvir é grátis")', 'qe("h3", "Acompanhar mesas")');
  source = once(
    source,
    '? "Ouvindo"\n            : "Ouvir",',
    '? "Acompanhando"\n            : "Acompanhar",',
  );
  source = once(source, '${t.listeners} ouvintes', '${t.listeners} acompanhando');
  source = once(source, 'S === "voice" ? "Sala de voz"', 'S === "voice" ? "Grupo e voz local"');
  source = once(
    source,
    'O círculo interno é reservado às duas cadeiras. No externo, a escuta é automática quando há uma única mesa. Você também pode ouvir e entrar na fila de qualquer lugar. Debater exige Premium.',
    `As mesas e filas funcionam localmente. ${notice}`,
  );
  source = once(
    source,
    'nn("Ouvir por proximidade", () => this.action("proximity"))',
    'nn("Acompanhar mesa próxima · sem áudio automático", () => this.action("proximity"))',
  );
  source = once(
    source,
    'Ouça ou entre na fila de qualquer lugar. O anfitrião chama e você é levado à cadeira. Participar exige Premium e estar a pé.',
    'Acompanhe a mesa ou entre na fila de qualquer lugar. O anfitrião chama e você é levado à cadeira. O áudio fica no painel Voz local, sem escuta automática da mesa.',
  );
  source = once(
    source,
    'this.label("Volume do debate", w)',
    '(w.disabled = true, this.label("Volume do debate · indisponível nesta instalação", w))',
  );
  source = once(
    source,
    `nn("Ativar áudio", () => {
          this.voice
            .startAudio()
            .catch(() =>
              this.message("Toque no botão de som do jogo e tente novamente."),
            );
        })`,
    `nn("Controles de voz local", () => {
          __localVoiceControls(message => this.message(message), () => this.hidePanel());
        })`,
  );
  source = once(
    source,
    `this.audioStatus.textContent = this.me.listeningOff
      ? "Áudio desconectado"
      : this.voice.status`,
    `this.audioStatus.textContent = "${notice}"`,
  );
  return source;
}
