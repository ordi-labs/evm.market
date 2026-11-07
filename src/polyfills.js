import {Buffer as BufferPolyfill} from 'buffer'

globalThis.Buffer = globalThis.Buffer ?? BufferPolyfill

export function ensureBufferGlobal(target = globalThis) {
  if (typeof target.Buffer === 'undefined') target.Buffer = BufferPolyfill
  return target.Buffer
}
