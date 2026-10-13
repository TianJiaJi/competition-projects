/** Incremental UTF-8 decoder usable in mini programs without TextDecoder. */
export class Utf8Decoder {
  private pending: number[] = [];
  decode(chunk: Uint8Array, final = false) {
    const bytes = [...this.pending, ...chunk];
    this.pending = [];
    let text = "";
    for (let i = 0; i < bytes.length; ) {
      const first = bytes[i];
      let size =
        first < 128
          ? 1
          : first >= 194 && first < 224
            ? 2
            : first < 240 && first >= 224
              ? 3
              : first <= 244 && first >= 240
                ? 4
                : 0;
      if (!size) {
        text += "\uFFFD";
        i++;
        continue;
      }
      if (i + size > bytes.length) {
        if (!final) {
          this.pending = bytes.slice(i);
          break;
        }
        text += "\uFFFD";
        i++;
        continue;
      }
      let code = first & [0, 127, 31, 15, 7][size],
        valid = true;
      for (let j = 1; j < size; j++) {
        if ((bytes[i + j] & 192) !== 128) {
          valid = false;
          break;
        }
        code = (code << 6) | (bytes[i + j] & 63);
      }
      if (
        !valid ||
        (size === 2 && code < 128) ||
        (size === 3 && code < 2048) ||
        (size === 4 && code < 65536) ||
        code > 0x10ffff ||
        (code >= 0xd800 && code <= 0xdfff)
      ) {
        text += "\uFFFD";
        i++;
        continue;
      }
      text += String.fromCodePoint(code);
      i += size;
    }
    return text;
  }
}
export interface StreamEvent {
  event: string;
  data: string;
}
export class SseParser {
  private decoder = new Utf8Decoder();
  private buffer = "";
  private event = "message";
  private lines: string[] = [];
  private emit: (event: StreamEvent) => void;
  constructor(emit: (event: StreamEvent) => void) {
    this.emit = emit;
  }
  push(chunk: Uint8Array | string) {
    this.buffer +=
      typeof chunk === "string" ? chunk : this.decoder.decode(chunk);
    this.drain();
  }
  finish() {
    this.buffer += this.decoder.decode(new Uint8Array(), true);
    this.drain(); /* No synthetic done on an incomplete frame. */
  }
  private drain() {
    if (this.buffer.length > 2_000_000) throw Error("流式事件过大。");
    let end: number;
    while ((end = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, end).replace(/\r$/, "");
      this.buffer = this.buffer.slice(end + 1);
      if (!line) {
        if (this.lines.length)
          this.emit({ event: this.event, data: this.lines.join("\n") });
        this.event = "message";
        this.lines = [];
        continue;
      }
      if (line.startsWith(":")) continue;
      const index = line.indexOf(":");
      const key = index < 0 ? line : line.slice(0, index);
      const value = index < 0 ? "" : line.slice(index + 1).replace(/^ /, "");
      if (key === "event") this.event = value;
      if (key === "data") this.lines.push(value);
    }
  }
}
