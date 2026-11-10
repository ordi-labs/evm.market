import './polyfills.js'
import EthereumProvider from '@walletconnect/ethereum-provider'
import { verifyMessage } from 'ethers'

const projectId = 'f981fcdc036a0a273c655b90030221e4'
const appUrl = window.location.origin
const metadata = {
  name: 'evm.market',
  description: 'Verified NFT marketplace for Base and Polygon',
  url: appUrl,
  icons: [`${appUrl}/icons/icon.svg`]
}

// Classic WalletConnect v2: one connection method, one QR modal, no injected wallets.
window.__walletConnectProviderPromise = EthereumProvider.init({
  projectId,
  chains: [8453],
  optionalChains: [137],
  showQrModal: true,
  metadata,
  qrModalOptions: { themeMode: 'dark' }
})

window.__verifyMessage = verifyMessage
