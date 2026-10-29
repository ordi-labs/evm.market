import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("sign-in gate opens the wallet chooser instead of forcing WalletConnect", () => {
  assert.match(
    html,
    /\$\("signatureGateContinue"\)\.addEventListener\("click",\(\)=>\{[\s\S]*?chooseWalletProvider\(\)/
  );
  assert.doesNotMatch(
    html,
    /\$\("signatureGateContinue"\)\.addEventListener\("click",\(\)=>connectWalletConnect\(\)\)/
  );
});

test("wallet chooser keeps injected wallets and WalletConnect available", () => {
  assert.match(html, /const root=window\.ethereum/);
  assert.match(html, /button\.addEventListener\("click",\(\)=>\{walletChooserStatus\("Connecting to "\+name/);
  assert.match(html, /wcButton\.addEventListener\("click",\(\)=>connectWalletConnect\(\)\)/);
});

test("sign-in remains message-only and does not request a transaction", () => {
  assert.match(html, /method:"personal_sign"/);
  assert.match(html, /This signature does not authorize a blockchain transaction/);
});
