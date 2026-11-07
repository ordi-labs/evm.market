import test from "node:test";
import assert from "node:assert/strict";
import {Buffer as BufferPolyfill} from "buffer";
import {ensureBufferGlobal} from "../src/polyfills.js";

test("browser polyfill installs Buffer before Reown wallet operations",()=>{
  const target={};
  const buffer=ensureBufferGlobal(target);
  assert.equal(buffer,BufferPolyfill);
  assert.equal(buffer.from("wallet").toString("base64"),"d2FsbGV0");
  assert.equal(target.Buffer,BufferPolyfill);
});

test("browser polyfill preserves an existing native Buffer implementation",()=>{
  const nativeBuffer=function NativeBuffer(){};
  const target={Buffer:nativeBuffer};
  assert.equal(ensureBufferGlobal(target),nativeBuffer);
});
