import './polyfills.js'

let appKitPromise

window.__loadReownAppKit = () => {
  if (!appKitPromise) {
    appKitPromise = import('./wallet-appkit.js')
      .then(({ appKit, verifyMessage }) => {
        window.__reownAppKit = appKit
        window.__verifyMessage = verifyMessage
        return appKit
      })
      .catch(error => {
        appKitPromise = null
        throw error
      })
  }
  return appKitPromise
}
