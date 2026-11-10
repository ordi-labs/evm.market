import { createAppKit } from '@reown/appkit'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { base, polygon } from '@reown/appkit/networks'
import { verifyMessage } from 'ethers'

const projectId = 'f981fcdc036a0a273c655b90030221e4'
const networks = [base, polygon]
const appUrl = window.location.origin
const metadata = {
  name: 'evm.market',
  description: 'Verified NFT marketplace for Base and Polygon',
  url: appUrl,
  icons: [`${appUrl}/icons/icon.svg`]
}

const appKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks,
  defaultNetwork: base,
  projectId,
  metadata,
  themeMode: 'dark',
  enableInjected: false,
  allWallets: 'SHOW',
  features: {
    analytics: false,
    allWallets: true,
    connectMethodsOrder: ['wallet'],
    emailCapture: false,
    socials: false,
    swaps: false,
    onramp: false
  }
})

export { appKit, verifyMessage }
