import './polyfills.js'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { createAppKit } from '@reown/appkit/react'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { base } from '@reown/appkit/networks'
import { verifyMessage } from 'ethers'

const projectId = 'f981fcdc036a0a273c655b90030221e4'
const appUrl = 'https://evm-market-premium.pages.dev'
const metadata = {
  name: 'evm.market',
  description: 'Verified NFT marketplace for Base',
  url: appUrl,
  icons: [`${appUrl}/icons/icon.svg`]
}

const appKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [base],
  projectId,
  metadata,
  // Show browser extension wallets (MetaMask, Rabby, Coinbase Wallet, etc.)
  // alongside WalletConnect in the AppKit modal.
  enableInjected: true,
  features: {
    analytics: true,
    emailCapture: false,
    socials: false,
    swaps: false,
    onramp: false
  }
})

window.__reownAppKit = appKit
window.__verifyMessage = verifyMessage

function AppKitBridge() {
  return null
}

createRoot(document.getElementById('appkit-root')).render(
  <React.StrictMode>
    <AppKitBridge />
  </React.StrictMode>
)
