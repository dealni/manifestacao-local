/* Adaptive expander based on Smartcast's noise-reduction-worklet.js.
 * Browser noise suppression handles speech; this smooth gate attenuates pauses.
 * No recordings, network calls or audio storage. */
class DebateDenoise extends AudioWorkletProcessor {
 constructor(){super();this.floor=.003;this.gain=1;this.quiet=0;this.enabled=true;this.strength=2;this.port.onmessage=e=>{if(e.data.reset){this.floor=.003;this.quiet=0;}this.enabled=e.data.enabled!==false;this.strength=Math.max(1,Math.min(4,Number(e.data.strength)||2));};}
 process(inputs,outputs){const a=inputs[0]?.[0],b=outputs[0]?.[0];if(!a||!b)return true;
  let energy=0;for(const v of a)energy+=v*v;const rms=Math.sqrt(energy/a.length);
  if(rms<this.floor*3){this.quiet+=a.length;if(this.quiet>sampleRate*.3)this.floor=.999*this.floor+.001*rms;}else this.quiet=0;
  // A soft knee and a -32 dB floor preserve quiet consonants and avoid abrupt cuts.
  const db=20*Math.log10(Math.max(rms,1e-8)),threshold=20*Math.log10(Math.max(.0003,this.floor))+6,diff=db-threshold;
  const reduction=diff>3?0:diff< -3?-diff*(this.strength-1):(3-diff)*(3-diff)/12*(this.strength-1);
  const target=this.enabled?Math.max(.025,Math.pow(10,-reduction/20)):1;
  for(let i=0;i<a.length;i++){const coeff=1-Math.exp(-1/(sampleRate*(target>this.gain?.003:.09)));this.gain+=coeff*(target-this.gain);b[i]=a[i]*this.gain;}
  for(let c=1;c<outputs[0].length;c++)outputs[0][c].set(b);return true;
 }
}
registerProcessor('debate-denoise',DebateDenoise);
