// The palanque microphone's samples, on the audio thread (client/palanque-mic.ts; an AudioWorklet module, so a plain
// file served as it is): while on, every 20 ms of the
// processed microphone goes straight to the encoder worker (client/palanque-encoder.ts) through the port it was
// given, so a busy page (the 3D avenue) never makes the voice skip. Off: nothing is copied or sent.
class PalanqueCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false;
    this.out = null;
    this.size = Math.round(sampleRate * 0.02);
    this.buf = new Float32Array(this.size);
    this.fill = 0;
    this.port.onmessage = (e) => {
      if (e.data.port) this.out = e.data.port;
      if (typeof e.data.on === "boolean") {
        this.on = e.data.on;
        this.fill = 0;
        this.out?.postMessage({ on: this.on });
      }
    };
  }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!this.on || !this.out || !input) return true;
    let i = 0;
    while (i < input.length) {
      const n = Math.min(input.length - i, this.size - this.fill);
      this.buf.set(input.subarray(i, i + n), this.fill);
      this.fill += n;
      i += n;
      if (this.fill === this.size) {
        const pcm = this.buf;
        this.out.postMessage({ pcm, rate: sampleRate }, [pcm.buffer]);
        this.buf = new Float32Array(this.size);
        this.fill = 0;
      }
    }
    return true;
  }
}
registerProcessor("palanque-capture", PalanqueCapture);
