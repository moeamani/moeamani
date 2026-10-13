// Is the computer playing through headphones (a jack, USB or Bluetooth) rather than its speakers?
//
// Browsers say when audio devices come and go ('devicechange'), and list them, but only name them
// once the site may use the microphone; without names, headphones and speakers look the same. So
// it's switched on from Settings: that asks for the microphone once, closes it straight away
// (nothing is recorded), and from then on the device names can be read. Safari doesn't list audio
// outputs to pages at all, so there it's not available.

const KEY = 'pl-headphones';
// what output names say: headphones and the like, and speakers (which win when both match)
const PERSONAL = /head|ear(phone|bud|pod)?s?\b|bud|airpod|bluetooth|\bbt\b|usb|hands-?free|wireless|beats|jabra|sennheiser|bose|sony wh|wf-|galaxy buds|pixel buds|line out|jack/i;
const SPEAKER = /speaker|built-?in output|internal|display audio|hdmi|displayport|monitor|tv\b/i;

export function personal(name) {
  return PERSONAL.test(name) && !SPEAKER.test(name);
}

export class Headphones {
  // onChange(plugged, name): plugged true/false, whenever that changes
  constructor(onChange) {
    this.onChange = onChange;
    this.md = navigator.mediaDevices;
    this.supported = !!(this.md?.enumerateDevices && 'ondevicechange' in this.md) && !/iP(hone|ad|od)/.test(navigator.userAgent);
    this.enabled = this.supported && read();
    this.plugged = null; // unknown until it can read the names
    this.named = false;
    if (this.supported) {
      this.md.addEventListener('devicechange', () => this.#check());
      this.#check(true);
    }
  }

  status() {
    if (!this.supported) return 'Not Available';
    return this.enabled ? 'On' : 'Off';
  }

  async toggle() {
    if (!this.supported) return;
    if (this.enabled) {
      this.enabled = false;
      save(false);
      if (this.plugged) this.onChange?.(false, '', false);
      this.plugged = null;
      return;
    }
    if (!this.named) {
      // ask once for the microphone, only to be allowed to read the devices' names
      try {
        const stream = await this.md.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch (err) {
        console.info(`Headphone detection needs the microphone permission (${err.name}).`);
        return;
      }
    }
    this.enabled = true;
    save(true);
    await this.#check();
  }

  // the output sound is going to now, and whether it's headphones
  async #check(first = false) {
    let devices;
    try {
      devices = await this.md.enumerateDevices();
    } catch {
      return;
    }
    const outputs = devices.filter((d) => d.kind === 'audiooutput');
    this.named = outputs.some((d) => d.label);
    if (!this.named || !this.enabled) return;
    // the default output; Chrome lists it first as "Default - <name>"
    const current = outputs.find((d) => d.deviceId === 'default') || outputs[0];
    const name = (current?.label || '').replace(/^default\s*-\s*/i, '');
    const plugged = personal(name);
    if (plugged === this.plugged) return;
    this.plugged = plugged;
    this.onChange?.(plugged, name, first);
  }
}

function read() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function save(on) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {}
}
